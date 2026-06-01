-- Overseer cross-workspace acting capability (fork feature, fork-offset number).
-- The secretary agent can act with its owner's authority across the owner's
-- ACTIVE watched workspaces, enforced by middleware (scope + irreversible-op
-- denylist) and recorded in an audit log.

-- Kill switch. When false, no acting token is minted and outstanding ones are
-- rejected (see GetOverseerActingToken).
ALTER TABLE overseer ADD COLUMN IF NOT EXISTS acting_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Ephemeral per-run tokens (mov_ prefix). Minted at task-claim for the
-- secretary agent and injected into its run, mirroring the mat_ task-token
-- pattern — never copyable by a human, short-lived.
CREATE TABLE IF NOT EXISTS overseer_acting_token (
    token_hash TEXT PRIMARY KEY,
    overseer_id UUID NOT NULL REFERENCES overseer(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_overseer_acting_token_overseer ON overseer_acting_token(overseer_id);

-- Audit trail of every mutating request made with an overseer token.
CREATE TABLE IF NOT EXISTS overseer_action_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    overseer_id UUID NOT NULL REFERENCES overseer(id) ON DELETE CASCADE,
    workspace_id UUID,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    allowed BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_overseer_action_log_overseer ON overseer_action_log(overseer_id, created_at DESC);
