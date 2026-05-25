import { queryOptions } from "@tanstack/react-query";
import { getApi } from "../api";
import { runtimeKeys } from "../runtimes/queries";
import { workspaceKeys } from "../workspace/queries";
import type { Agent, AgentRuntime, MemberWithUser, Workspace } from "../types";

/** Cross-workspace agent directory — one query per workspace. */
export function directoryAgentListOptions(workspace: Workspace) {
  return queryOptions({
    queryKey: workspaceKeys.agents(workspace.id),
    queryFn: () =>
      getApi()
        .withSlug(workspace.slug)
        .listAgents({ workspace_id: workspace.id, include_archived: true }),
  });
}

/** Runtimes for the directory runtime filter and bulk-assign picker. */
export function directoryRuntimeListOptions(workspace: Workspace) {
  return queryOptions({
    queryKey: runtimeKeys.list(workspace.id),
    queryFn: () =>
      getApi()
        .withSlug(workspace.slug)
        .listRuntimes({ workspace_id: workspace.id }),
  });
}

export function directoryMemberListOptions(workspace: Workspace) {
  return queryOptions({
    queryKey: workspaceKeys.members(workspace.id),
    queryFn: () =>
      getApi().withSlug(workspace.slug).listMembers(workspace.id),
  });
}

export type AgentsDirectoryRow = {
  agent: Agent;
  workspace: Workspace;
  runtime: AgentRuntime | null;
};

export function buildAgentsDirectoryRows(
  workspaces: Workspace[],
  agentsByWorkspaceId: Map<string, Agent[]>,
  runtimesByWorkspaceId: Map<string, AgentRuntime[]>,
): AgentsDirectoryRow[] {
  const rows: AgentsDirectoryRow[] = [];
  for (const workspace of workspaces) {
    const agents = agentsByWorkspaceId.get(workspace.id) ?? [];
    const runtimeById = new Map(
      (runtimesByWorkspaceId.get(workspace.id) ?? []).map((r) => [r.id, r]),
    );
    for (const agent of agents) {
      rows.push({
        agent,
        workspace,
        runtime: runtimeById.get(agent.runtime_id) ?? null,
      });
    }
  }
  return rows;
}

export function memberRoleByUserId(
  members: MemberWithUser[],
  userId: string | null,
): MemberWithUser["role"] | null {
  if (!userId) return null;
  return members.find((m) => m.user_id === userId)?.role ?? null;
}

export type AgentsDirectoryWorkspaceGroup = {
  workspace: Workspace;
  rows: AgentsDirectoryRow[];
};

/** Groups directory rows by workspace, sorted by workspace name then agent name. */
export function groupDirectoryRowsByWorkspace(
  rows: AgentsDirectoryRow[],
): AgentsDirectoryWorkspaceGroup[] {
  const byId = new Map<string, AgentsDirectoryRow[]>();
  for (const row of rows) {
    const list = byId.get(row.workspace.id) ?? [];
    list.push(row);
    byId.set(row.workspace.id, list);
  }
  return [...byId.values()]
    .map((groupRows) => {
      const sorted = [...groupRows].sort((a, b) =>
        a.agent.name.localeCompare(b.agent.name),
      );
      return { workspace: sorted[0]!.workspace, rows: sorted };
    })
    .sort((a, b) => a.workspace.name.localeCompare(b.workspace.name));
}
