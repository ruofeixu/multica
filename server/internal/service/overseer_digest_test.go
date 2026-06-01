package service

import (
	"strings"
	"testing"
)

func TestRenderDigest(t *testing.T) {
	sections := []OverseerDigestWorkspace{
		{
			WorkspaceID: "ws-1",
			Name:        "Frontend",
			Open:        5,
			Blocked:     1,
			Unassigned:  2,
			Stale:       1,
			Items: []OverseerDigestItem{
				{Title: "Fix login bug", Status: "blocked", Priority: "high", Unassigned: false, Stale: false},
				{Title: "Update docs", Status: "todo", Priority: "low", Unassigned: true, Stale: true, DaysSince: 5},
			},
		},
		{
			WorkspaceID: "ws-2",
			Name:        "Backend",
			Open:        2,
			Blocked:     0,
			Unassigned:  0,
			Stale:       0,
			Items:       nil,
		},
	}

	out := renderDigest(sections, 3)

	checks := []string{
		"## Cross-Workspace Status Digest",
		"### Frontend",
		"Open: 5 | Blocked: 1 | Unassigned: 2 | Stale (>3d): 1",
		"Needs attention:",
		"[BLOCKED] Fix login bug",
		"[unassigned] Update docs",
		"5d no update",
		"### Backend",
		"Open: 2 | Blocked: 0 | Unassigned: 0",
	}
	for _, c := range checks {
		if !strings.Contains(out, c) {
			t.Errorf("digest missing %q\nfull output:\n%s", c, out)
		}
	}

	// Backend has no noteworthy items — "Needs attention" should not appear for it
	if idx := strings.Index(out, "### Backend"); idx >= 0 {
		after := out[idx:]
		if strings.Contains(after[:min(len(after), 100)], "Needs attention") {
			t.Error("Backend section should not have 'Needs attention'")
		}
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
