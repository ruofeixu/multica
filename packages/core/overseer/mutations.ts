import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getApi } from "../api";
import { overseerKeys } from "./queries";
import type { Overseer, UpdateOverseerBody, UpsertOverseerWatchBody } from "./types";

export function useUpdateOverseer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateOverseerBody) => api.updateOverseer(body),
    onSuccess: (data: Overseer) => qc.setQueryData(overseerKeys.config(), data),
  });
}

export function useUpsertOverseerWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workspaceId, body }: { workspaceId: string; body: UpsertOverseerWatchBody }) =>
      api.upsertOverseerWorkspace(workspaceId, body),
    onSuccess: (data: Overseer) => qc.setQueryData(overseerKeys.config(), data),
  });
}

export function useRemoveOverseerWatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) => api.deleteOverseerWorkspace(workspaceId),
    onSettled: () => qc.invalidateQueries({ queryKey: overseerKeys.config() }),
  });
}

export function useSetOverseerActing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => api.setOverseerActing(enabled),
    onSuccess: (data: Overseer) => qc.setQueryData(overseerKeys.config(), data),
  });
}

export function useSyncOverseerAutopilot() {
  return useMutation({
    mutationFn: async ({
      hqWorkspaceSlug,
      agentId,
      cron,
    }: {
      hqWorkspaceSlug: string;
      agentId: string;
      cron: string;
    }) => {
      const client = getApi().withSlug(hqWorkspaceSlug);
      const autopilot = await client.createAutopilot({
        title: "Overseer — cross-workspace digest",
        description:
          "Scheduled by the Overseer feature. The secretary agent will receive a cross-workspace status digest and write a report.",
        assignee_id: agentId,
        execution_mode: "run_only",
      });
      await client.createAutopilotTrigger(autopilot.id, {
        kind: "schedule",
        cron_expression: cron,
        timezone: "UTC",
      });
      return autopilot;
    },
  });
}
