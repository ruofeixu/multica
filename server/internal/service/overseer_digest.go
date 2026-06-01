package service

// overseer_digest.go — fork feature (see FORK_CHANGES.md).
// BuildOverseerDigest fetches open issues across all ACTIVE watched workspaces
// and returns a markdown briefing for the secretary agent. Pure function:
// no side effects, no upstream dependencies beyond db.Queries.

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// OverseerDigestWorkspace is one workspace's summary in the digest.
type OverseerDigestWorkspace struct {
	WorkspaceID string
	Name        string
	Open        int
	Blocked     int
	Unassigned  int
	Stale       int // no update in staleDays
	Items       []OverseerDigestItem
}

// OverseerDigestItem is a single issue entry.
type OverseerDigestItem struct {
	Title      string
	Status     string
	Priority   string
	Unassigned bool
	Stale      bool
	DaysSince  int
}

// BuildOverseerDigest returns a markdown cross-workspace status briefing for
// the overseer's secretary agent. staleDays controls the "no update" threshold
// (0 = disabled). Returns "" when the overseer has no active workspaces.
func BuildOverseerDigest(ctx context.Context, queries *db.Queries, overseerID string, staleDays int) (string, error) {
	ovUUID, err := util.ParseUUID(overseerID)
	if err != nil {
		return "", fmt.Errorf("overseer digest: invalid overseer id: %w", err)
	}

	wsIDs, err := queries.ListActiveOverseerWorkspaceIDs(ctx, ovUUID)
	if err != nil {
		return "", fmt.Errorf("overseer digest: list active workspaces: %w", err)
	}
	if len(wsIDs) == 0 {
		return "", nil
	}

	now := time.Now()
	var sections []OverseerDigestWorkspace

	for _, wsID := range wsIDs {
		ws, werr := queries.GetWorkspace(ctx, wsID)
		if werr != nil {
			continue // workspace deleted or inaccessible — skip silently
		}
		issues, ierr := queries.ListOpenIssuesForOverseer(ctx, wsID)
		if ierr != nil {
			continue
		}

		sec := OverseerDigestWorkspace{
			WorkspaceID: util.UUIDToString(wsID),
			Name:        ws.Name,
			Open:        len(issues),
		}

		for _, iss := range issues {
			daysSince := int(now.Sub(iss.UpdatedAt.Time).Hours() / 24)
			stale := staleDays > 0 && daysSince >= staleDays
			unassigned := !iss.AssigneeID.Valid

			if iss.Status == "blocked" {
				sec.Blocked++
			}
			if unassigned {
				sec.Unassigned++
			}
			if stale {
				sec.Stale++
			}

			// Only include noteworthy items in the per-workspace list to keep
			// the briefing concise.
			if iss.Status == "blocked" || unassigned || stale {
				sec.Items = append(sec.Items, OverseerDigestItem{
					Title:      iss.Title,
					Status:     iss.Status,
					Priority:   iss.Priority,
					Unassigned: unassigned,
					Stale:      stale,
					DaysSince:  daysSince,
				})
			}
		}
		sections = append(sections, sec)
	}

	if len(sections) == 0 {
		return "", nil
	}

	return renderDigest(sections, staleDays), nil
}

func renderDigest(sections []OverseerDigestWorkspace, staleDays int) string {
	var b strings.Builder
	b.WriteString("## Cross-Workspace Status Digest\n\n")
	b.WriteString("This digest was injected at task-claim time. Use it to write a status report.\n\n")

	for _, s := range sections {
		fmt.Fprintf(&b, "### %s\n", s.Name)
		fmt.Fprintf(&b, "- Open: %d | Blocked: %d | Unassigned: %d", s.Open, s.Blocked, s.Unassigned)
		if staleDays > 0 {
			fmt.Fprintf(&b, " | Stale (>%dd): %d", staleDays, s.Stale)
		}
		b.WriteString("\n")

		if len(s.Items) > 0 {
			b.WriteString("\nNeeds attention:\n")
			for _, it := range s.Items {
				tags := []string{}
				if it.Status == "blocked" {
					tags = append(tags, "BLOCKED")
				}
				if it.Unassigned {
					tags = append(tags, "unassigned")
				}
				if it.Stale {
					fmt.Fprintf(&b, "- [%s] %s (%s, %dd no update)\n",
						strings.Join(tags, ", "), it.Title, it.Priority, it.DaysSince)
					continue
				}
				fmt.Fprintf(&b, "- [%s] %s (%s)\n",
					strings.Join(tags, ", "), it.Title, it.Priority)
			}
		}
		b.WriteString("\n")
	}
	return b.String()
}
