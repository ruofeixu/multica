"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Button } from "@multica/ui/components/ui/button";
import { getApi } from "@multica/core/api";
import { workspaceListOptions, agentListOptions } from "@multica/core/workspace/queries";
import {
  overseerOptions,
  overseerAuditOptions,
  useUpdateOverseer,
  useUpsertOverseerWatch,
  useRemoveOverseerWatch,
  useSetOverseerActing,
  type AttentionConfig,
  type OverseerWatchStatus,
} from "@multica/core/overseer";
import type { Workspace } from "@multica/core/types";

const STATUSES: OverseerWatchStatus[] = ["active", "paused", "done"];
const DEFAULT_ATTENTION: Required<AttentionConfig> = {
  blocked: true,
  stale_days: 3,
  unassigned: true,
};

const selectCls =
  "h-7 rounded border bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring";

// ─── Config panel ──────────────────────────────────────────────────────────

function ConfigPanel({
  workspaces,
  hqWorkspaceId,
  agentId,
  attention,
}: {
  workspaces: Workspace[];
  hqWorkspaceId: string | null;
  agentId: string | null;
  attention: AttentionConfig;
}) {
  const update = useUpdateOverseer();
  const [hq, setHq] = useState(hqWorkspaceId ?? "");
  const [agent, setAgent] = useState(agentId ?? "");
  const [cfg, setCfg] = useState<Required<AttentionConfig>>({ ...DEFAULT_ATTENTION, ...attention });

  useEffect(() => {
    setHq(hqWorkspaceId ?? "");
    setAgent(agentId ?? "");
    setCfg({ ...DEFAULT_ATTENTION, ...attention });
  }, [hqWorkspaceId, agentId, attention]);

  const hqWs = workspaces.find((w) => w.id === hq);
  const { data: agents = [] } = useQuery({
    ...agentListOptions(hq),
    enabled: !!hqWs,
    queryFn: () => getApi().withSlug(hqWs!.slug).listAgents({ workspace_id: hq, include_archived: false }),
  });

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <h3 className="text-sm font-semibold">Secretary configuration</h3>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          HQ workspace
          <select className={selectCls} value={hq} onChange={(e) => { setHq(e.target.value); setAgent(""); }}>
            <option value="">— none —</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          Secretary agent
          <select className={selectCls} value={agent} onChange={(e) => setAgent(e.target.value)} disabled={!hqWs}>
            <option value="">— none —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="text-muted-foreground">Needs attention when:</span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={cfg.blocked} onChange={(e) => setCfg({ ...cfg, blocked: e.target.checked })} />
          blocked
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={cfg.unassigned} onChange={(e) => setCfg({ ...cfg, unassigned: e.target.checked })} />
          unassigned
        </label>
        <label className="flex items-center gap-1.5">
          no update for
          <input
            type="number"
            min={0}
            className={`${selectCls} w-14`}
            value={cfg.stale_days ?? 0}
            onChange={(e) => setCfg({ ...cfg, stale_days: Number(e.target.value) })}
          />
          days
        </label>
      </div>

      <Button
        size="sm"
        className="h-7 text-xs"
        disabled={update.isPending}
        onClick={() =>
          update.mutate({
            hq_workspace_id: hq || null,
            agent_id: agent || null,
            attention_config: cfg,
          })
        }
      >
        {update.isPending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

// ─── Digest dashboard ────────────────────────────────────────────────────────

interface DigestRow {
  workspace: Workspace;
  status: OverseerWatchStatus;
  open: number;
  blocked: number;
  unassigned: number;
  stale: number;
  loading: boolean;
}

function useDigest(
  watches: { workspace_id: string; status: OverseerWatchStatus }[],
  wsById: Map<string, Workspace>,
  staleDays: number | null,
): DigestRow[] {
  const active = watches.filter((w) => w.status === "active" && wsById.has(w.workspace_id));
  const results = useQueries({
    queries: active.map((w) => {
      const ws = wsById.get(w.workspace_id)!;
      return {
        queryKey: ["overseer-digest", w.workspace_id],
        queryFn: () =>
          getApi().withSlug(ws.slug).listIssues({ workspace_id: w.workspace_id, open_only: true, limit: 200 }),
      };
    }),
  });

  return useMemo(() => {
    const cutoff = Date.now() - (staleDays ?? DEFAULT_ATTENTION.stale_days ?? 3) * 86_400_000;
    return active.map((w, i) => {
      const ws = wsById.get(w.workspace_id)!;
      const res = results[i];
      const issues = res?.data?.issues ?? [];
      return {
        workspace: ws,
        status: w.status,
        open: issues.length,
        blocked: issues.filter((it) => it.status === "blocked").length,
        unassigned: issues.filter((it) => !it.assignee_id).length,
        stale: issues.filter((it) => new Date(it.updated_at).getTime() < cutoff).length,
        loading: res?.isPending ?? false,
      };
    });
  }, [active, results, wsById, staleDays]);
}

function DigestTable({ rows }: { rows: DigestRow[] }) {
  if (rows.length === 0) {
    return <p className="px-1 py-4 text-xs text-muted-foreground">No active workspaces to supervise.</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead className="text-muted-foreground">
        <tr className="border-b text-left">
          <th className="py-1.5 pr-2 font-medium">Workspace</th>
          <th className="py-1.5 px-2 font-medium">Open</th>
          <th className="py-1.5 px-2 font-medium">Blocked</th>
          <th className="py-1.5 px-2 font-medium">Unassigned</th>
          <th className="py-1.5 px-2 font-medium">Stale</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.workspace.id} className="border-b last:border-0">
            <td className="py-1.5 pr-2 font-medium truncate">{r.workspace.name}</td>
            <td className="py-1.5 px-2 tabular-nums">{r.loading ? "…" : r.open}</td>
            <td className={`py-1.5 px-2 tabular-nums ${r.blocked ? "text-destructive font-semibold" : ""}`}>{r.loading ? "…" : r.blocked}</td>
            <td className={`py-1.5 px-2 tabular-nums ${r.unassigned ? "text-amber-600 font-semibold" : ""}`}>{r.loading ? "…" : r.unassigned}</td>
            <td className={`py-1.5 px-2 tabular-nums ${r.stale ? "text-amber-600 font-semibold" : ""}`}>{r.loading ? "…" : r.stale}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Watch list ────────────────────────────────────────────────────────────

function WatchList({
  workspaces,
  watches,
}: {
  workspaces: Workspace[];
  watches: { workspace_id: string; status: OverseerWatchStatus }[];
}) {
  const upsert = useUpsertOverseerWatch();
  const remove = useRemoveOverseerWatch();
  const watchedIds = new Set(watches.map((w) => w.workspace_id));
  const unwatched = workspaces.filter((w) => !watchedIds.has(w.id));
  const nameById = new Map(workspaces.map((w) => [w.id, w.name]));

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <h3 className="text-sm font-semibold">Supervised workspaces</h3>
      <div className="space-y-1">
        {watches.map((w) => (
          <div key={w.workspace_id} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate">{nameById.get(w.workspace_id) ?? w.workspace_id}</span>
            <div className="flex items-center gap-2">
              <select
                className={selectCls}
                value={w.status}
                onChange={(e) =>
                  upsert.mutate({ workspaceId: w.workspace_id, body: { status: e.target.value as OverseerWatchStatus } })
                }
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1.5 text-xs text-muted-foreground"
                onClick={() => remove.mutate(w.workspace_id)}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        {watches.length === 0 && (
          <p className="text-xs text-muted-foreground">No workspaces supervised yet.</p>
        )}
      </div>

      {unwatched.length > 0 && (
        <label className="flex items-center gap-1.5 pt-1 text-xs">
          Add
          <select
            className={selectCls}
            value=""
            onChange={(e) => e.target.value && upsert.mutate({ workspaceId: e.target.value, body: { status: "active" } })}
          >
            <option value="">— select workspace —</option>
            {unwatched.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

// ─── Acting credential ───────────────────────────────────────────────────────

function ActingPanel({ enabled, activeNames }: { enabled: boolean; activeNames: string[] }) {
  const setActing = useSetOverseerActing();
  const { data: audit = [] } = useQuery({ ...overseerAuditOptions(), enabled });

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Cross-workspace acting</h3>
          <p className="text-xs text-muted-foreground">
            Let the secretary act with your authority across active workspaces.
          </p>
        </div>
        <Button
          size="sm"
          variant={enabled ? "secondary" : "default"}
          className="h-7 shrink-0 text-xs"
          disabled={setActing.isPending}
          onClick={() => setActing.mutate(!enabled)}
        >
          {enabled ? "Disable" : "Enable"}
        </Button>
      </div>

      {enabled && (
        <>
          <p className="text-xs text-muted-foreground">
            Scope: {activeNames.length ? activeNames.join(", ") : "no active workspaces"}. Excludes deletes,
            member management, billing, and token/config changes.
          </p>
          <div>
            <p className="mb-1 text-xs font-medium">Recent actions</p>
            {audit.length === 0 ? (
              <p className="text-xs text-muted-foreground">No actions recorded yet.</p>
            ) : (
              <ul className="space-y-0.5 font-mono text-[11px]">
                {audit.slice(0, 10).map((e, i) => (
                  <li key={i} className={e.allowed ? "" : "text-destructive"}>
                    {e.allowed ? "✓" : "✗"} {e.method} {e.path}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function OverseerPage() {
  const { data: workspaces = [] } = useQuery(workspaceListOptions());
  const { data: overseer, isPending } = useQuery(overseerOptions());

  const wsById = useMemo(() => new Map(workspaces.map((w) => [w.id, w])), [workspaces]);
  const watches = overseer?.workspaces ?? [];
  const staleDays = overseer?.attention_config?.stale_days ?? DEFAULT_ATTENTION.stale_days;
  const digest = useDigest(watches, wsById, staleDays);
  const activeNames = watches
    .filter((w) => w.status === "active")
    .map((w) => wsById.get(w.workspace_id)?.name ?? w.workspace_id);

  if (isPending) {
    return <p className="p-4 text-sm text-muted-foreground">Loading overseer…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h2 className="text-base font-semibold">Overseer · 总管</h2>
        <p className="text-xs text-muted-foreground">
          Cross-workspace progress at a glance. Mark a workspace “done” to stop supervising it.
        </p>
      </div>

      <div className="rounded-lg border p-3">
        <h3 className="mb-2 text-sm font-semibold">Progress digest</h3>
        <DigestTable rows={digest} />
      </div>

      <ConfigPanel
        workspaces={workspaces}
        hqWorkspaceId={overseer?.hq_workspace_id ?? null}
        agentId={overseer?.agent_id ?? null}
        attention={overseer?.attention_config ?? {}}
      />

      <ActingPanel enabled={overseer?.acting_enabled ?? false} activeNames={activeNames} />

      <WatchList workspaces={workspaces} watches={watches} />
    </div>
  );
}
