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
