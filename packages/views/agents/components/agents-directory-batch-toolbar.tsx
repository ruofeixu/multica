"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { MemberWithUser } from "@multica/core/types";
import { getApi } from "@multica/core/api";
import {
  buildBulkRuntimeMappings,
  collectBulkProviderOptions,
  dominantProviderFromRows,
  pickBulkProbeRuntime,
  testBulkAgentConfiguration,
  useAgentsDirectorySelectionStore,
  type AgentsDirectoryRow,
} from "@multica/core/agents";
import { providerDisplayName } from "@multica/core/runtimes";
import { canEditAgent } from "@multica/core/permissions";
import { useAuthStore } from "@multica/core/auth";
import { workspaceKeys } from "@multica/core/workspace/queries";
import { Button } from "@multica/ui/components/ui/button";
import { Label } from "@multica/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@multica/ui/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@multica/ui/components/ui/dialog";
import { ProviderLogo } from "../../runtimes/components/provider-logo";
import { useT } from "../../i18n";
import { AgentsDirectoryBatchModelField } from "./agents-directory-batch-model-field";

type WorkspaceBulkGroup = {
  workspace: AgentsDirectoryRow["workspace"];
  rows: AgentsDirectoryRow[];
  runtimes: import("@multica/core/types").AgentRuntime[];
  members: MemberWithUser[];
};

export function AgentsDirectoryBatchToolbar({
  rows,
  membersByWorkspaceId,
  runtimesByWorkspaceId,
}: {
  rows: AgentsDirectoryRow[];
  membersByWorkspaceId: Map<string, MemberWithUser[]>;
  runtimesByWorkspaceId: Map<string, import("@multica/core/types").AgentRuntime[]>;
}) {
  const { t } = useT("agents");
  const qc = useQueryClient();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const selectedIds = useAgentsDirectorySelectionStore((s) => s.selectedIds);
  const clear = useAgentsDirectorySelectionStore((s) => s.clear);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetProvider, setTargetProvider] = useState("");
  const [targetModel, setTargetModel] = useState("");
  const [testMessage, setTestMessage] = useState<{
    tone: "success" | "warning" | "error";
    text: string;
  } | null>(null);

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.agent.id)),
    [rows, selectedIds],
  );
  const count = selectedRows.length;

  const editableRows = useMemo(() => {
    return selectedRows.filter((row) => {
      const members = membersByWorkspaceId.get(row.workspace.id) ?? [];
      const role =
        members.find((m) => m.user_id === currentUserId)?.role ?? null;
      return canEditAgent(row.agent, { userId: currentUserId, role }).allowed;
    });
  }, [selectedRows, membersByWorkspaceId, currentUserId]);

  const workspaceGroups = useMemo((): WorkspaceBulkGroup[] => {
    const byId = new Map<string, AgentsDirectoryRow[]>();
    for (const row of editableRows) {
      const list = byId.get(row.workspace.id) ?? [];
      list.push(row);
      byId.set(row.workspace.id, list);
    }
    return [...byId.entries()]
      .map(([wsId, groupRows]) => ({
        workspace: groupRows[0]!.workspace,
        rows: groupRows,
        runtimes: runtimesByWorkspaceId.get(wsId) ?? [],
        members: membersByWorkspaceId.get(wsId) ?? [],
      }))
      .sort((a, b) => a.workspace.name.localeCompare(b.workspace.name));
  }, [editableRows, runtimesByWorkspaceId, membersByWorkspaceId]);

  const providerOptions = useMemo(
    () => collectBulkProviderOptions(workspaceGroups, currentUserId),
    [workspaceGroups, currentUserId],
  );

  const mappings = useMemo(
    () =>
      targetProvider
        ? buildBulkRuntimeMappings(
            workspaceGroups,
            targetProvider,
            currentUserId,
          )
        : [],
    [workspaceGroups, targetProvider, currentUserId],
  );

  const probeRuntime = useMemo(
    () => pickBulkProbeRuntime(mappings),
    [mappings],
  );

  const probeWorkspaceName = useMemo(() => {
    if (!probeRuntime) return null;
    return (
      mappings.find((m) => m.runtime?.id === probeRuntime.id)?.workspaceName ??
      null
    );
  }, [mappings, probeRuntime]);

  const mappableRows = useMemo(() => {
    const runtimeByWorkspace = new Map(
      mappings
        .filter((m) => m.runtime)
        .map((m) => [m.workspaceId, m.runtime!] as const),
    );
    return editableRows.filter((row) =>
      runtimeByWorkspace.has(row.workspace.id),
    );
  }, [editableRows, mappings]);

  const assignMutation = useMutation({
    mutationFn: async ({
      model,
      targets,
      runtimeByWorkspaceId: runtimeMap,
    }: {
      model: string;
      targets: AgentsDirectoryRow[];
      runtimeByWorkspaceId: Map<string, string>;
    }) => {
      const results = await Promise.allSettled(
        targets.map((row) => {
          const runtimeId = runtimeMap.get(row.workspace.id);
          if (!runtimeId) {
            return Promise.reject(new Error("no_runtime"));
          }
          const body: { runtime_id: string; model?: string } = {
            runtime_id: runtimeId,
          };
          const trimmed = model.trim();
          if (trimmed) body.model = trimmed;
          return getApi()
            .withSlug(row.workspace.slug)
            .updateAgent(row.agent.id, body);
        }),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        throw new Error(`${failed}`);
      }
      return targets;
    },
    onSuccess: (targets) => {
      const wsIds = new Set(targets.map((r) => r.workspace.id));
      for (const wsId of wsIds) {
        qc.invalidateQueries({ queryKey: workspaceKeys.agents(wsId) });
      }
      const skipped = editableRows.length - targets.length;
      clear();
      setDialogOpen(false);
      toast.success(
        t(($) => $.directory.batch_apply_success, { count: targets.length }),
      );
      if (skipped > 0) {
        toast.warning(
          t(($) => $.directory.batch_apply_skipped, { count: skipped }),
        );
      }
    },
    onError: () => {
      toast.error(t(($) => $.directory.batch_runtime_failed));
    },
  });

  const testMutation = useMutation({
    mutationFn: () => testBulkAgentConfiguration(probeRuntime, targetModel),
    onSuccess: (result) => {
      if (!result.ok) {
        if (result.kind === "no_runtime") {
          setTestMessage({
            tone: "error",
            text: t(($) => $.directory.batch_test_no_runtime),
          });
          return;
        }
        if (result.kind === "offline") {
          setTestMessage({
            tone: "error",
            text: t(($) => $.directory.batch_test_offline, {
              name: result.runtimeName ?? "",
            }),
          });
          return;
        }
        setTestMessage({
          tone: "error",
          text: t(($) => $.directory.batch_test_failed, {
            name: result.runtimeName ?? "",
            error: result.error ?? "",
          }),
        });
        return;
      }

      if (result.kind === "managed_by_runtime") {
        setTestMessage({
          tone: "success",
          text: t(($) => $.directory.batch_test_managed_runtime, {
            name: result.runtimeName,
          }),
        });
        return;
      }

      if (!result.modelMatched && targetModel.trim()) {
        setTestMessage({
          tone: "warning",
          text: t(($) => $.directory.batch_test_custom_model, {
            name: result.runtimeName,
            model: targetModel.trim(),
          }),
        });
        return;
      }

      setTestMessage({
        tone: "success",
        text: t(($) => $.directory.batch_test_success, {
          name: result.runtimeName,
          count: result.modelCount,
        }),
      });
    },
    onError: () => {
      setTestMessage({
        tone: "error",
        text: t(($) => $.directory.batch_test_failed, {
          name: probeRuntime?.name ?? "",
          error: "",
        }),
      });
    },
  });

  if (count === 0) return null;

  const canBulkAssign = editableRows.length > 0;
  const skippedWorkspaceCount = mappings.filter((m) => !m.runtime).length;

  const openBulkDialog = () => {
    if (!canBulkAssign) return;
    const options = collectBulkProviderOptions(workspaceGroups, currentUserId);
    const dominant = dominantProviderFromRows(editableRows);
    setTargetProvider(
      dominant && options.includes(dominant) ? dominant : (options[0] ?? ""),
    );
    const models = new Set(
      editableRows.map((r) => r.agent.model).filter((m) => m.length > 0),
    );
    setTargetModel(models.size === 1 ? [...models][0]! : "");
    setTestMessage(null);
    setDialogOpen(true);
  };

  const handleAssign = async () => {
    const runtimeMap = new Map(
      mappings
        .filter((m) => m.runtime)
        .map((m) => [m.workspaceId, m.runtime!.id] as const),
    );
    if (mappableRows.length === 0) return;
    await assignMutation.mutateAsync({
      model: targetModel,
      targets: mappableRows,
      runtimeByWorkspaceId: runtimeMap,
    });
  };

  let bulkHint: string | null = null;
  if (editableRows.length === 0) {
    bulkHint = t(($) => $.directory.batch_no_permission);
  } else if (count > editableRows.length) {
    bulkHint = t(($) => $.directory.batch_partial_permission, {
      editable: editableRows.length,
      total: count,
    });
  }

  return (
    <>
      <div className="flex items-center gap-1 rounded-lg border bg-background px-2 py-1.5 shadow-lg">
        <div className="flex items-center gap-1.5 border-r pr-2 mr-1 pl-1">
          <span className="text-sm font-medium">
            {t(($) => $.directory.batch_selected, { count })}
          </span>
          <button
            type="button"
            onClick={clear}
            className="rounded p-0.5 hover:bg-accent transition-colors"
          >
            <X className="size-3.5 text-muted-foreground" />
          </button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={!canBulkAssign || assignMutation.isPending}
          onClick={openBulkDialog}
        >
          {t(($) => $.directory.batch_configure)}
        </Button>
        {bulkHint && (
          <span className="max-w-md truncate text-xs text-muted-foreground">
            {bulkHint}
          </span>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b px-4 py-4">
            <DialogTitle>
              {t(($) => $.directory.batch_dialog_title, {
                count: editableRows.length,
              })}
            </DialogTitle>
            <DialogDescription>
              {t(($) => $.directory.batch_dialog_unified_desc)}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="bulk-provider">
                {t(($) => $.directory.batch_provider_label)}
              </Label>
              {providerOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t(($) => $.directory.batch_no_providers)}
                </p>
              ) : (
                <Select
                  value={targetProvider}
                  onValueChange={(value) => {
                    if (value) {
                      setTargetProvider(value);
                      setTestMessage(null);
                    }
                  }}
                >
                  <SelectTrigger id="bulk-provider" className="h-9 w-full">
                    <SelectValue>
                      {(value) =>
                        value ? (
                          <span className="inline-flex items-center gap-2">
                            <ProviderLogo
                              provider={value}
                              className="h-4 w-4 shrink-0"
                            />
                            {providerDisplayName(value)}
                          </span>
                        ) : (
                          t(($) => $.directory.batch_provider_placeholder)
                        )
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {providerOptions.map((provider) => (
                      <SelectItem key={provider} value={provider}>
                        <span className="inline-flex items-center gap-2">
                          <ProviderLogo
                            provider={provider}
                            className="h-4 w-4 shrink-0"
                          />
                          {providerDisplayName(provider)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-[11px] text-muted-foreground">
                {t(($) => $.directory.batch_provider_hint)}
              </p>
            </div>

            <AgentsDirectoryBatchModelField
              probeRuntime={probeRuntime}
              workspaceName={probeWorkspaceName}
              value={targetModel}
              onChange={(value) => {
                setTargetModel(value);
                setTestMessage(null);
              }}
            />

            {targetProvider && probeRuntime && (
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <Label>{t(($) => $.directory.batch_test_label)}</Label>
                    <p className="text-[11px] text-muted-foreground">
                      {t(($) => $.directory.batch_test_desc, {
                        runtime: probeRuntime.name,
                        workspace: probeWorkspaceName ?? "",
                      })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={testMutation.isPending}
                    onClick={() => void testMutation.mutate()}
                  >
                    {testMutation.isPending ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        {t(($) => $.directory.batch_test_running)}
                      </>
                    ) : (
                      t(($) => $.directory.batch_test)
                    )}
                  </Button>
                </div>
                {testMessage && (
                  <div
                    className={`flex items-start gap-2 text-xs ${
                      testMessage.tone === "success"
                        ? "text-success"
                        : testMessage.tone === "warning"
                          ? "text-warning"
                          : "text-destructive"
                    }`}
                  >
                    {testMessage.tone === "error" ? (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    )}
                    <span>{testMessage.text}</span>
                  </div>
                )}
              </div>
            )}

            {targetProvider && (
              <div className="space-y-2">
                <Label>
                  {t(($) => $.directory.batch_mapping_preview_label)}
                </Label>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border bg-muted/20 p-2">
                  {mappings.map((m) => (
                    <div
                      key={m.workspaceId}
                      className="flex items-start justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{m.workspaceName}</div>
                        <div className="text-muted-foreground">
                          {t(($) => $.directory.batch_dialog_agent_count, {
                            count: m.agentCount,
                          })}
                        </div>
                      </div>
                      {m.runtime ? (
                        <div className="flex min-w-0 items-center gap-1.5 text-right">
                          <ProviderLogo
                            provider={m.runtime.provider}
                            className="h-3.5 w-3.5 shrink-0"
                          />
                          <span className="truncate font-mono">
                            {m.runtime.name}
                          </span>
                        </div>
                      ) : (
                        <span className="shrink-0 text-destructive">
                          {t(($) => $.directory.batch_mapping_unavailable, {
                            provider: providerDisplayName(m.provider),
                          })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {skippedWorkspaceCount > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    {t(($) => $.directory.batch_mapping_skip_note, {
                      count: skippedWorkspaceCount,
                    })}
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="mx-0 mb-0 shrink-0 border-t bg-muted/50 px-4 py-4">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={assignMutation.isPending}
            >
              {t(($) => $.directory.batch_cancel)}
            </Button>
            <Button
              onClick={() => void handleAssign()}
              disabled={
                !targetProvider ||
                mappableRows.length === 0 ||
                assignMutation.isPending
              }
            >
              {t(($) => $.directory.batch_apply)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
