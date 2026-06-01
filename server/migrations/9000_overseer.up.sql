-- Overseer (总管): a cross-workspace coordinator owned by a single user.
-- Fork-only feature. Uses fork-offset migration number (9000+) so it never
-- collides with upstream's sequential NNN_ migrations.

CREATE TABLE IF NOT EXISTS overseer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
    -- Workspace that hosts the secretary agent. Nullable until configured.
    hq_workspace_id UUID REFERENCES workspace(id) ON DELETE SET NULL,
    -- The secretary/总管 agent (lives in hq_workspace). Nullable until configured.
    agent_id UUID REFERENCES agent(id) ON DELETE SET NULL,
    -- UI-configurable "needs attention" thresholds (blocked/stale_days/unassigned/...).
    attention_config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which workspaces this overseer supervises, and their monitoring status.
-- status 'done' = excluded from the digest and from supervision.
CREATE TABLE IF NOT EXISTS overseer_workspace (
    overseer_id UUID NOT NULL REFERENCES overseer(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'done')),
    cadence_cron TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (overseer_id, workspace_id)
);
