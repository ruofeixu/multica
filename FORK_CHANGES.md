# Fork Changes Registry

Tracks fork-only features and **every upstream file touched**, so periodic
upstream syncs (`git fetch origin && git merge origin/main`) only need to
re-check this short list for conflicts. `git rerere` is enabled to auto-reuse
past conflict resolutions.

## Conventions for fork-only code (keep conflicts near zero)

- Put all new code in **new files** under a feature namespace. Upstream never
  touches these, so they never conflict.
- Migrations use a **fork-offset number** (`9000+`) so they never collide with
  upstream's sequential `NNN_` migrations.
- Touch shared/hot upstream files in **at most one small additive spot**, listed
  below.

---

## Feature: Overseer (总管) — cross-workspace coordinator (Phase 1)

Cross-workspace dashboard + watch registry + config. Scheduling reuses the
existing Autopilot feature. See design in chat history.

### New, isolated files (zero upstream conflict)

- `server/migrations/9000_overseer.up.sql`, `9000_overseer.down.sql`
- `server/pkg/db/queries/overseer.sql`
- `server/pkg/db/generated/overseer.sql.go` (hand-written; sqlc not on PATH — regen-safe)
- `server/internal/handler/overseer.go`
- `packages/core/overseer/*`
- `packages/views/overseer/*`

### Upstream files touched (re-check these on every sync)

| File | Edit | Conflict risk |
|------|------|---------------|
| `server/cmd/server/router.go` | +1 line: `RegisterOverseerRoutes(r, h)` in the authed user-scoped group | low |
| `packages/core/api/client.ts` | one delimited block of `// Overseer (fork)` methods | medium (hot file) |
| `packages/core/package.json` | +1 `exports` entry: `"./overseer"` | low |
| `packages/views/hub/hub-page.tsx` | tab switch Chat \| Overseer (this is a fork-only file already) | none |

### Phase 2a — Scheduled digest reporting (DONE)

New isolated files: `server/internal/service/overseer_digest.go` (+test),
`server/pkg/db/queries/overseer.sql` (ListOpenIssuesForOverseer appended).

Upstream files touched:
| File | Edit |
|------|------|
| `server/internal/handler/daemon.go` | inject digest into `resp.Agent.Instructions` when agent is overseer secretary |

### Phase 2b (not yet done)

Auto-nudge: secretary posts cross-workspace comments/builds follow-up issues.
Will use the `mov_` acting credential from Milestone 0.

---

## Feature: Overseer acting credential (Milestone 0) — cross-workspace agent authority

The secretary agent can act with its owner's authority across the owner's
ACTIVE watched workspaces, via an ephemeral `mov_` token minted per run
(mirrors the `mat_` pattern). Clamped by middleware to active workspaces + an
irreversible/low-frequency op denylist. Kill switch: `overseer.acting_enabled`.

### New, isolated files

- `server/migrations/9001_overseer_acting.{up,down}.sql`
- `server/internal/middleware/overseer_scope.go` (+ `_test.go`) — pure
  `OverseerActionAllowed` decision + enforcement middleware

### Upstream files touched (re-check these on every sync)

| File | Edit | Conflict risk |
|------|------|---------------|
| `server/internal/middleware/auth.go` | `mov_` token branch (auth as owner + `X-Actor-Source: overseer` + `X-Overseer-ID`); strip client `X-Overseer-ID` | medium (security file) |
| `server/cmd/server/router.go` | +1 line: `r.Use(middleware.OverseerScope(queries))` in protected group | low |
| `server/internal/handler/actor_guards.go` | +`"overseer"` case in `RequireHumanActor` deny switch | low |
| `server/internal/handler/daemon.go` | inject `mov_` token for the secretary agent at task claim | medium |
| `server/internal/handler/overseer.go` | acting endpoints + `MintOverseerActingToken` (fork file, extended) | none |
| `server/pkg/db/generated/overseer.sql.go` | acting/audit queries + `acting_enabled` column (fork file, extended) | none |

### SECURITY MODEL

- The `mov_` token authenticates AS THE OWNER → reuses every existing
  per-workspace permission check (exactly "what the human can do").
- `OverseerScope` clamps it: reads allowed; mutations only in the overseer's
  `active` watched workspaces; **denied**: `/api/tokens`, `/api/overseer`,
  `/api/cloud-billing`, `/api/me` (mutating), workspace/agent delete, member
  management. Every mutating attempt is audited (`overseer_action_log`).
- `RequireHumanActor` rejects the overseer actor on account-level endpoints.
- Kill switch: disabling `acting_enabled` revokes outstanding tokens.
