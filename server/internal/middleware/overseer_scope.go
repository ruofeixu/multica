package middleware

// Overseer scope enforcement (fork feature). An overseer acting token (mov_)
// authenticates AS THE OWNER, so by itself it carries the owner's full
// authority. This middleware clamps requests tagged X-Actor-Source "overseer"
// to the overseer's ACTIVE watched workspaces and an irreversible/low-frequency
// op denylist, and records every mutating attempt in the audit log.
//
// See FORK_CHANGES.md. Pure decision logic lives in OverseerActionAllowed so it
// can be unit-tested without a DB.

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

func isReadMethod(m string) bool {
	switch strings.ToUpper(m) {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	}
	return false
}

// escalationPrefixes are paths an overseer token must never mutate: PAT
// management and the overseer's own config (privilege escalation / scope
// bypass), billing, and the human's profile.
var escalationPrefixes = []string{"/api/tokens", "/api/overseer", "/api/cloud-billing", "/api/me"}

// isIrreversibleOp matches low-frequency / irreversible lifecycle operations
// that are excluded by policy even though the owner could perform them:
// member management and deletion of a whole workspace or agent.
func isIrreversibleOp(method, path string) bool {
	seg := strings.Split(strings.Trim(path, "/"), "/")
	for _, s := range seg {
		if s == "members" {
			return true
		}
	}
	if strings.ToUpper(method) == http.MethodDelete && len(seg) == 3 && seg[0] == "api" &&
		(seg[1] == "workspaces" || seg[1] == "agents") {
		return true
	}
	return false
}

// OverseerActionAllowed is the pure scope decision for an overseer-acting
// request. Reads are always allowed. Mutations are denied for escalation /
// self-config prefixes and irreversible ops, and otherwise require the resolved
// target workspace to be in the overseer's active set.
func OverseerActionAllowed(method, path, targetWorkspaceID string, activeWorkspaces map[string]bool) (bool, string) {
	if isReadMethod(method) {
		return true, ""
	}
	for _, p := range escalationPrefixes {
		if path == p || strings.HasPrefix(path, p+"/") {
			return false, "escalation_denied"
		}
	}
	if isIrreversibleOp(method, path) {
		return false, "irreversible_denied"
	}
	if targetWorkspaceID == "" || !activeWorkspaces[targetWorkspaceID] {
		return false, "workspace_not_active"
	}
	return true, ""
}

// OverseerScope enforces the decision above and audits mutating attempts. It is
// a no-op for every non-overseer request (normal users are unaffected).
func OverseerScope(queries *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("X-Actor-Source") != "overseer" {
				next.ServeHTTP(w, r)
				return
			}
			overseerID, oerr := util.ParseUUID(r.Header.Get("X-Overseer-ID"))
			if oerr != nil {
				http.Error(w, `{"error":"invalid overseer identity"}`, http.StatusForbidden)
				return
			}
			targetWS := ResolveWorkspaceIDFromRequest(r, queries)

			active := map[string]bool{}
			if ids, err := queries.ListActiveOverseerWorkspaceIDs(r.Context(), overseerID); err == nil {
				for _, id := range ids {
					active[uuidToString(id)] = true
				}
			}

			allowed, reason := OverseerActionAllowed(r.Method, r.URL.Path, targetWS, active)

			if !isReadMethod(r.Method) {
				var wsUUID pgtype.UUID
				if parsed, perr := util.ParseUUID(targetWS); perr == nil {
					wsUUID = parsed
				}
				_ = queries.CreateOverseerActionLog(r.Context(), db.CreateOverseerActionLogParams{
					OverseerID:  overseerID,
					WorkspaceID: wsUUID,
					Method:      r.Method,
					Path:        r.URL.Path,
					Allowed:     allowed,
				})
			}

			if !allowed {
				slog.Warn("overseer scope denied", "path", r.URL.Path, "reason", reason)
				http.Error(w, `{"error":"overseer action not permitted: `+reason+`"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
