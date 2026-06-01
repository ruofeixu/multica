package middleware

import "testing"

func TestOverseerActionAllowed(t *testing.T) {
	active := map[string]bool{"ws-active": true}

	cases := []struct {
		name    string
		method  string
		path    string
		ws      string
		want    bool
		reason  string
	}{
		// Reads are always allowed, regardless of workspace.
		{"read any workspace", "GET", "/api/issues", "ws-other", true, ""},
		{"read no workspace", "GET", "/api/workspaces", "", true, ""},

		// Allowed mutations in an active workspace.
		{"create issue in active ws", "POST", "/api/issues", "ws-active", true, ""},
		{"edit workspace config in active ws", "PATCH", "/api/workspaces/ws-active", "ws-active", true, ""},
		{"update agent in active ws", "PATCH", "/api/agents/a1", "ws-active", true, ""},

		// Mutations in a non-active workspace are denied.
		{"create issue in inactive ws", "POST", "/api/issues", "ws-other", false, "workspace_not_active"},
		{"mutation with no workspace", "POST", "/api/issues", "", false, "workspace_not_active"},

		// Escalation / self-config / billing / profile denied even in active ws.
		{"mint PAT", "POST", "/api/tokens", "ws-active", false, "escalation_denied"},
		{"reconfigure overseer", "PUT", "/api/overseer/acting", "ws-active", false, "escalation_denied"},
		{"billing", "POST", "/api/cloud-billing/subscribe", "ws-active", false, "escalation_denied"},
		{"edit human profile", "PATCH", "/api/me", "ws-active", false, "escalation_denied"},

		// Irreversible / low-frequency ops denied even in active ws.
		{"delete workspace", "DELETE", "/api/workspaces/ws-active", "ws-active", false, "irreversible_denied"},
		{"delete agent", "DELETE", "/api/agents/a1", "ws-active", false, "irreversible_denied"},
		{"invite member", "POST", "/api/workspaces/ws-active/members", "ws-active", false, "irreversible_denied"},
		{"remove member", "DELETE", "/api/workspaces/ws-active/members/m1", "ws-active", false, "irreversible_denied"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, reason := OverseerActionAllowed(c.method, c.path, c.ws, active)
			if got != c.want {
				t.Fatalf("allowed = %v, want %v (reason %q)", got, c.want, reason)
			}
			if !got && reason != c.reason {
				t.Fatalf("reason = %q, want %q", reason, c.reason)
			}
		})
	}
}
