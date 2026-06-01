import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
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
