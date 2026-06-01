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

### Phase 2 (not yet done — will touch more upstream files)

Auto-nudge: secretary agent consumes digest and posts cross-workspace
comments/issues. Will touch `server/internal/daemon/prompt.go` and the
autopilot service — record here when implemented.
