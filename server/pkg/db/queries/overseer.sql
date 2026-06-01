-- name: GetOverseerByOwner :one
SELECT * FROM overseer WHERE owner_user_id = $1;

-- name: CreateOverseer :one
INSERT INTO overseer (owner_user_id) VALUES ($1)
RETURNING *;

-- name: UpdateOverseer :one
UPDATE overseer SET
    hq_workspace_id = $2,
    agent_id = $3,
    attention_config = $4,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: ListOverseerWorkspaces :many
SELECT * FROM overseer_workspace
WHERE overseer_id = $1
ORDER BY created_at ASC;

-- name: UpsertOverseerWorkspace :one
INSERT INTO overseer_workspace (overseer_id, workspace_id, status, cadence_cron)
VALUES ($1, $2, $3, $4)
ON CONFLICT (overseer_id, workspace_id) DO UPDATE SET
    status = EXCLUDED.status,
    cadence_cron = EXCLUDED.cadence_cron,
    updated_at = now()
RETURNING *;

-- name: DeleteOverseerWorkspace :exec
DELETE FROM overseer_workspace
WHERE overseer_id = $1 AND workspace_id = $2;

-- name: ListActiveOverseerWorkspaceIDs :many
SELECT workspace_id FROM overseer_workspace
WHERE overseer_id = $1 AND status = 'active';

-- name: SetOverseerActingEnabled :one
UPDATE overseer SET acting_enabled = $2, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: GetOverseerByAgent :one
SELECT * FROM overseer WHERE agent_id = $1;

-- name: CreateOverseerActingToken :exec
INSERT INTO overseer_acting_token (token_hash, overseer_id, expires_at)
VALUES ($1, $2, $3);

-- name: GetOverseerActingToken :one
SELECT t.overseer_id, o.owner_user_id
FROM overseer_acting_token t
JOIN overseer o ON o.id = t.overseer_id
WHERE t.token_hash = $1 AND t.expires_at > now() AND o.acting_enabled = TRUE;

-- name: DeleteOverseerActingTokens :exec
DELETE FROM overseer_acting_token WHERE overseer_id = $1;

-- name: CreateOverseerActionLog :exec
INSERT INTO overseer_action_log (overseer_id, workspace_id, method, path, allowed)
VALUES ($1, $2, $3, $4, $5);

-- name: ListOverseerActionLog :many
SELECT id, overseer_id, workspace_id, method, path, allowed, created_at
FROM overseer_action_log
WHERE overseer_id = $1
ORDER BY created_at DESC
LIMIT 50;
