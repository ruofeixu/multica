"use client";

import { Cloud, Monitor } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { AgentsDirectoryRow } from "@multica/core/agents";
import { useAgentsDirectorySelectionStore } from "@multica/core/agents";
import { Checkbox } from "@multica/ui/components/ui/checkbox";
import { ProviderLogo } from "../../runtimes/components/provider-logo";
import { useT } from "../../i18n";

type ColumnHeaderT = ReturnType<typeof useT<"agents">>["t"];

export function DirectoryRowCheckbox({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  const checked = useAgentsDirectorySelectionStore((s) =>
    s.selectedIds.has(agentId),
  );
  const toggle = useAgentsDirectorySelectionStore((s) => s.toggle);
  const { t } = useT("agents");

  return (
    <Checkbox
      checked={checked}
      onCheckedChange={() => toggle(agentId)}
      onClick={(e) => e.stopPropagation()}
      aria-label={t(($) => $.directory.select_row, { name: agentName })}
    />
  );
}

export function createAgentsDirectoryColumns({
  t,
}: {
  t: ColumnHeaderT;
}): ColumnDef<AgentsDirectoryRow>[] {
  return [
    {
      id: "select",
      size: 44,
      header: () => null,
      cell: ({ row }) => (
        <DirectoryRowCheckbox
          agentId={row.original.agent.id}
          agentName={row.original.agent.name}
        />
      ),
    },
    {
      id: "agent",
      header: () => t(($) => $.columns.agent),
      size: 220,
      meta: { grow: true },
      cell: ({ row }) => {
        const { agent } = row.original;
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{agent.name}</span>
              {agent.archived_at && (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {t(($) => $.row.archived)}
                </span>
              )}
            </div>
            {agent.description ? (
              <p className="truncate text-xs text-muted-foreground">
                {agent.description}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/60">
                {t(($) => $.row.no_description)}
              </p>
            )}
          </div>
        );
      },
    },
    {
      id: "runtime",
      header: () => t(($) => $.columns.runtime),
      size: 200,
      meta: { grow: true },
      cell: ({ row }) => <DirectoryRuntimeCell row={row.original} t={t} />,
    },
    {
      id: "model",
      header: () => t(($) => $.directory.column_model),
      size: 120,
      cell: ({ row }) => (
        <span className="truncate font-mono text-xs text-muted-foreground">
          {row.original.agent.model || "—"}
        </span>
      ),
    },
    {
      id: "mode",
      header: () => t(($) => $.directory.column_mode),
      size: 72,
      cell: ({ row }) => {
        const mode = row.original.agent.runtime_mode;
        const Icon = mode === "cloud" ? Cloud : Monitor;
        return (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Icon className="h-3 w-3 shrink-0" />
            {mode === "cloud"
              ? t(($) => $.row.fallback_runtime_cloud)
              : t(($) => $.row.fallback_runtime_local)}
          </span>
        );
      },
    },
  ];
}

function DirectoryRuntimeCell({
  row,
  t,
}: {
  row: AgentsDirectoryRow;
  t: ColumnHeaderT;
}) {
  const runtime = row.runtime;
  if (!runtime) {
    return (
      <span className="text-xs text-muted-foreground">
        {t(($) => $.pickers.runtime_none)}
      </span>
    );
  }
  const isOnline = runtime.status === "online";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <ProviderLogo provider={runtime.provider} className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate font-mono text-xs">{runtime.name}</span>
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          isOnline ? "bg-success" : "bg-muted-foreground/40"
        }`}
      />
    </div>
  );
}
