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
  workspaces: OverseerWorkspace[];
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
