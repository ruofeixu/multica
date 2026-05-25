"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Bot, Search } from "lucide-react";
import {
  groupDirectoryRowsByWorkspace,
  useAgentsDirectoryData,
  useAgentsDirectorySelectionStore,
} from "@multica/core/agents";
import { canAssignAgentToIssue } from "@multica/core/permissions";
import { useAuthStore } from "@multica/core/auth";
import { paths } from "@multica/core/paths";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@multica/ui/components/ui/select";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { Checkbox } from "@multica/ui/components/ui/checkbox";
import { PageHeader } from "../../layout/page-header";
import { useNavigation } from "../../navigation";
import { useT } from "../../i18n";
import { createAgentsDirectoryColumns } from "./agents-directory-columns";
import { AgentsDirectoryBatchToolbar } from "./agents-directory-batch-toolbar";
import { AgentsDirectoryGroupedTable } from "./agents-directory-grouped-table";

const ALL_WORKSPACES = "__all__";
const ALL_RUNTIMES = "__all__";

export function AgentsDirectoryPage() {
  const { t } = useT("agents");
  const navigation = useNavigation();
  const currentUser = useAuthStore((s) => s.user);

  const {
    workspaces,
    isLoading,
    allRows,
    membersByWorkspaceId,
    runtimesByWorkspaceId,
  } = useAgentsDirectoryData();

  const [workspaceFilter, setWorkspaceFilter] = useState(ALL_WORKSPACES);
  const [runtimeFilter, setRuntimeFilter] = useState(ALL_RUNTIMES);
  const [search, setSearch] = useState("");
  const [hideArchived, setHideArchived] = useState(true);

  const selectedCount = useAgentsDirectorySelectionStore(
    (s) => s.selectedIds.size,
  );
  const select = useAgentsDirectorySelectionStore((s) => s.select);
  const deselect = useAgentsDirectorySelectionStore((s) => s.deselect);
  const setAll = useAgentsDirectorySelectionStore((s) => s.setAll);
  const clearSelection = useAgentsDirectorySelectionStore((s) => s.clear);

  const visibleRows = useMemo(() => {
    return allRows.filter((row) => {
      const members = membersByWorkspaceId.get(row.workspace.id) ?? [];
      const role =
        members.find((m) => m.user_id === currentUser?.id)?.role ?? null;
      if (
        !canAssignAgentToIssue(row.agent, {
          userId: currentUser?.id ?? null,
          role,
        }).allowed
      ) {
        return false;
      }
      if (hideArchived && row.agent.archived_at) return false;
      if (
        workspaceFilter !== ALL_WORKSPACES &&
        row.workspace.id !== workspaceFilter
      ) {
        return false;
      }
      if (
        runtimeFilter !== ALL_RUNTIMES &&
        row.agent.runtime_id !== runtimeFilter
      ) {
        return false;
      }
      const q = search.trim().toLowerCase();
      if (q) {
        const runtimeName = row.runtime?.name?.toLowerCase() ?? "";
        if (
          !row.agent.name.toLowerCase().includes(q) &&
          !(row.agent.description ?? "").toLowerCase().includes(q) &&
          !row.workspace.name.toLowerCase().includes(q) &&
          !runtimeName.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [
    allRows,
    membersByWorkspaceId,
    currentUser?.id,
    hideArchived,
    workspaceFilter,
    runtimeFilter,
    search,
  ]);

  const runtimeFilterOptions = useMemo(() => {
    const scoped =
      workspaceFilter === ALL_WORKSPACES
        ? allRows
        : allRows.filter((r) => r.workspace.id === workspaceFilter);
    const seen = new Map<string, NonNullable<(typeof allRows)[0]["runtime"]>>();
    for (const row of scoped) {
      if (row.runtime) seen.set(row.runtime.id, row.runtime);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [allRows, workspaceFilter]);

  useEffect(() => {
    if (
      runtimeFilter !== ALL_RUNTIMES &&
      !runtimeFilterOptions.some((r) => r.id === runtimeFilter)
    ) {
      setRuntimeFilter(ALL_RUNTIMES);
    }
  }, [runtimeFilter, runtimeFilterOptions]);

  const filteredIds = useMemo(
    () => visibleRows.map((r) => r.agent.id),
    [visibleRows],
  );

  const groupedRows = useMemo(
    () => groupDirectoryRowsByWorkspace(visibleRows),
    [visibleRows],
  );

  const allVisibleSelected = useMemo(
    () =>
      filteredIds.length > 0 &&
      filteredIds.every((id) =>
        useAgentsDirectorySelectionStore.getState().selectedIds.has(id),
      ),
    [filteredIds, selectedCount],
  );

  const handleToggleAll = useCallback(() => {
    if (allVisibleSelected) {
      clearSelection();
    } else {
      setAll(filteredIds);
    }
  }, [allVisibleSelected, filteredIds, clearSelection, setAll]);

  const handleToggleGroup = useCallback(
    (ids: string[]) => {
      const selected = useAgentsDirectorySelectionStore.getState().selectedIds;
      const allGroupSelected =
        ids.length > 0 && ids.every((id) => selected.has(id));
      if (allGroupSelected) deselect(ids);
      else select(ids);
    },
    [select, deselect],
  );

  const columns = useMemo(() => createAgentsDirectoryColumns({ t }), [t]);

  const table = useReactTable({
    data: visibleRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.agent.id,
  });

  if (isLoading) {
    return (
      <div className="flex flex-1 min-h-0 flex-col">
        <DirectoryPageHeader totalCount={0} />
        <div className="flex flex-1 min-h-0 flex-col gap-4 p-6">
          <Skeleton className="h-10 w-full max-w-2xl" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <DirectoryPageHeader totalCount={visibleRows.length} />

      <div className="flex flex-1 min-h-0 flex-col gap-4 p-6">
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
          <div className="flex h-12 shrink-0 flex-wrap items-center gap-3 border-b px-4">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t(($) => $.directory.search_placeholder)}
                className="h-8 pl-8 text-sm"
              />
            </div>
            <Select
              value={workspaceFilter}
              onValueChange={(v) => v && setWorkspaceFilter(v)}
            >
              <SelectTrigger className="h-8 w-[11rem] text-xs">
                <SelectValue
                  placeholder={t(($) => $.directory.filter_workspace)}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_WORKSPACES} className="text-xs">
                  {t(($) => $.directory.all_workspaces)}
                </SelectItem>
                {workspaces.map((ws) => (
                  <SelectItem key={ws.id} value={ws.id} className="text-xs">
                    {ws.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={runtimeFilter}
              onValueChange={(v) => v && setRuntimeFilter(v)}
            >
              <SelectTrigger className="h-8 w-[14rem] text-xs">
                <SelectValue
                  placeholder={t(($) => $.directory.filter_runtime)}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_RUNTIMES} className="text-xs">
                  {t(($) => $.directory.all_runtimes)}
                </SelectItem>
                {runtimeFilterOptions.map((rt) => (
                  <SelectItem key={rt.id} value={rt.id} className="text-xs">
                    {rt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant={hideArchived ? "secondary" : "outline"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setHideArchived((v) => !v)}
            >
              {hideArchived
                ? t(($) => $.directory.hide_archived)
                : t(($) => $.directory.show_archived)}
            </Button>
            <div className="ml-auto flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={handleToggleAll}
                  aria-label={t(($) => $.directory.select_all)}
                />
                {t(($) => $.directory.select_all)}
              </label>
              <span className="font-mono text-xs tabular-nums text-muted-foreground/70">
                {t(($) => $.directory.visible_count, {
                  count: visibleRows.length,
                })}
              </span>
            </div>
          </div>

          {visibleRows.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-16 text-center text-muted-foreground">
              <Bot className="h-8 w-8 opacity-40" />
              <p className="text-sm">{t(($) => $.directory.no_matches)}</p>
            </div>
          ) : (
            <div className="relative flex min-h-0 flex-1 flex-col">
              <AgentsDirectoryGroupedTable
                table={table}
                groups={groupedRows}
                onToggleGroup={handleToggleGroup}
                onRowClick={(row) =>
                  navigation.push(
                    paths
                      .workspace(row.workspace.slug)
                      .agentDetail(row.agent.id),
                  )
                }
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                <div className="pointer-events-auto">
                  <AgentsDirectoryBatchToolbar
                    rows={allRows}
                    membersByWorkspaceId={membersByWorkspaceId}
                    runtimesByWorkspaceId={runtimesByWorkspaceId}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DirectoryPageHeader({ totalCount }: { totalCount: number }) {
  const { t } = useT("agents");
  return (
    <PageHeader className="px-5">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-medium">{t(($) => $.directory.title)}</h1>
        {totalCount > 0 && (
          <span className="font-mono text-xs tabular-nums text-muted-foreground/70">
            {totalCount}
          </span>
        )}
        <p className="ml-2 hidden text-xs text-muted-foreground md:block">
          {t(($) => $.directory.tagline)}
        </p>
      </div>
    </PageHeader>
  );
}
