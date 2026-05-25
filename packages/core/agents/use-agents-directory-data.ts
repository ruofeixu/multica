"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { Agent, AgentRuntime, MemberWithUser, Workspace } from "../types";
import { workspaceListOptions } from "../workspace/queries";
import {
  buildAgentsDirectoryRows,
  directoryAgentListOptions,
  directoryMemberListOptions,
  directoryRuntimeListOptions,
  type AgentsDirectoryRow,
} from "./directory-queries";

const EMPTY_WORKSPACES: Workspace[] = [];
const EMPTY_AGENTS: Agent[] = [];
const EMPTY_RUNTIMES: AgentRuntime[] = [];
const EMPTY_MEMBERS: MemberWithUser[] = [];

/** Stable fingerprint so derived maps only rebuild when query data actually changes. */
function queriesFingerprint(
  queries: { dataUpdatedAt: number; fetchStatus: string }[],
): string {
  return queries
    .map((q) => `${q.dataUpdatedAt}:${q.fetchStatus}`)
    .join("|");
}

/**
 * Cross-workspace agent directory data loader.
 *
 * Memoizes useQueries option arrays — passing a fresh `workspaces.map(...)`
 * every render makes TanStack Query churn and forces the page to rebuild
 * derived rows on every parent re-render (main-thread freeze on open).
 */
export function useAgentsDirectoryData(): {
  workspaces: Workspace[];
  isLoading: boolean;
  allRows: AgentsDirectoryRow[];
  membersByWorkspaceId: Map<string, MemberWithUser[]>;
  runtimesByWorkspaceId: Map<string, AgentRuntime[]>;
} {
  const { data: workspaces = EMPTY_WORKSPACES, isLoading: workspacesLoading } =
    useQuery(workspaceListOptions());

  const agentQueryDefs = useMemo(
    () =>
      workspaces.map((ws) => ({
        ...directoryAgentListOptions(ws),
        staleTime: 30_000,
      })),
    [workspaces],
  );
  const agentQueries = useQueries({ queries: agentQueryDefs });
  const agentsFingerprint = queriesFingerprint(agentQueries);
  const agentsLoading = agentQueries.some((q) => q.isLoading);

  const agentsReady =
    workspaces.length > 0 &&
    agentQueries.length === workspaces.length &&
    agentQueries.every((q) => q.isFetched);

  const runtimeQueryDefs = useMemo(
    () =>
      workspaces.map((ws) => ({
        ...directoryRuntimeListOptions(ws),
        staleTime: 30_000,
        enabled: agentsReady,
      })),
    [workspaces, agentsReady],
  );
  const memberQueryDefs = useMemo(
    () =>
      workspaces.map((ws) => ({
        ...directoryMemberListOptions(ws),
        staleTime: 30_000,
        enabled: agentsReady,
      })),
    [workspaces, agentsReady],
  );
  const runtimeQueries = useQueries({ queries: runtimeQueryDefs });
  const memberQueries = useQueries({ queries: memberQueryDefs });
  const runtimesFingerprint = queriesFingerprint(runtimeQueries);
  const membersFingerprint = queriesFingerprint(memberQueries);

  const agentsByWorkspaceId = useMemo(() => {
    const map = new Map<string, Agent[]>();
    workspaces.forEach((ws, i) => {
      map.set(ws.id, agentQueries[i]?.data ?? EMPTY_AGENTS);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fingerprint tracks query data
  }, [workspaces, agentsFingerprint]);

  const runtimesByWorkspaceId = useMemo(() => {
    const map = new Map<string, AgentRuntime[]>();
    workspaces.forEach((ws, i) => {
      map.set(ws.id, runtimeQueries[i]?.data ?? EMPTY_RUNTIMES);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaces, runtimesFingerprint]);

  const membersByWorkspaceId = useMemo(() => {
    const map = new Map<string, MemberWithUser[]>();
    workspaces.forEach((ws, i) => {
      map.set(ws.id, memberQueries[i]?.data ?? EMPTY_MEMBERS);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaces, membersFingerprint]);

  const allRows = useMemo(
    () =>
      buildAgentsDirectoryRows(
        workspaces,
        agentsByWorkspaceId,
        runtimesByWorkspaceId,
      ),
    [workspaces, agentsByWorkspaceId, runtimesByWorkspaceId],
  );

  return {
    workspaces,
    isLoading: workspacesLoading || agentsLoading,
    allRows,
    membersByWorkspaceId,
    runtimesByWorkspaceId,
  };
}
