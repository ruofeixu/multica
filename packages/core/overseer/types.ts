// Overseer (总管) — fork feature types. Mirrors server/internal/handler/overseer.go.

export type OverseerWatchStatus = "active" | "paused" | "done";

export interface OverseerWorkspace {
  workspace_id: string;
  status: OverseerWatchStatus;
  cadence_cron: string | null;
}

// UI-configurable "needs attention" thresholds. All optional; server stores
// this verbatim as JSONB.
export interface AttentionConfig {
  blocked?: boolean;
  stale_days?: number | null;
  unassigned?: boolean;
}

export interface Overseer {
  id: string;
  hq_workspace_id: string | null;
  agent_id: string | null;
  attention_config: AttentionConfig;
  acting_enabled: boolean;
  workspaces: OverseerWorkspace[];
}

export interface OverseerAuditEntry {
  workspace_id: string | null;
  method: string;
  path: string;
  allowed: boolean;
  created_at: string;
}

export interface UpdateOverseerBody {
  hq_workspace_id?: string | null;
  agent_id?: string | null;
  attention_config?: AttentionConfig;
}

export interface UpsertOverseerWatchBody {
  status: OverseerWatchStatus;
  cadence_cron?: string | null;
}

export interface SyncAutopilotBody {
  cron: string;
}
