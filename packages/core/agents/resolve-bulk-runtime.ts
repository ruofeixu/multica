import type { AgentRuntime, AgentRuntimeMode } from "../types";

/** Mirrors RuntimePicker / server canUseRuntimeForAgent binding rules. */
export function canBindAgentToRuntime(
  runtime: AgentRuntime,
  userId: string | null,
): boolean {
  if (!userId) return true;
  if (runtime.owner_id === userId) return true;
  return runtime.visibility === "public";
}

export type PickRuntimeForBulkProviderOptions = {
  userId: string | null;
  /** Prefer local/cloud when multiple runtimes share the same provider. */
  preferMode?: AgentRuntimeMode | null;
};

/**
 * Picks one workspace runtime for a bulk provider assignment (e.g. codex, cursor).
 * Runtime UUIDs differ across workspaces; the user chooses the provider once.
 */
export function pickRuntimeForBulkProvider(
  runtimes: AgentRuntime[],
  provider: string,
  options: PickRuntimeForBulkProviderOptions,
): AgentRuntime | null {
  const eligible = runtimes.filter(
    (r) =>
      r.provider === provider && canBindAgentToRuntime(r, options.userId),
  );
  if (eligible.length === 0) return null;

  const score = (r: AgentRuntime): number => {
    let s = 0;
    if (r.status === "online") s += 100;
    if (options.userId && r.owner_id === options.userId) s += 50;
    if (options.preferMode && r.runtime_mode === options.preferMode) s += 30;
    return s;
  };

  return [...eligible].sort(
    (a, b) => score(b) - score(a) || a.name.localeCompare(b.name),
  )[0]!;
}

export type BulkRuntimeWorkspaceMapping = {
  workspaceId: string;
  workspaceName: string;
  agentCount: number;
  provider: string;
  runtime: AgentRuntime | null;
};

export function collectBulkProviderOptions(
  groups: { runtimes: AgentRuntime[] }[],
  userId: string | null,
): string[] {
  const providers = new Set<string>();
  for (const group of groups) {
    for (const runtime of group.runtimes) {
      if (canBindAgentToRuntime(runtime, userId)) {
        providers.add(runtime.provider);
      }
    }
  }
  return [...providers].sort((a, b) => a.localeCompare(b));
}

export function buildBulkRuntimeMappings(
  groups: {
    workspace: { id: string; name: string };
    rows: { agent: { runtime_mode: AgentRuntimeMode }; runtime: AgentRuntime | null }[];
    runtimes: AgentRuntime[];
  }[],
  provider: string,
  userId: string | null,
): BulkRuntimeWorkspaceMapping[] {
  return groups.map((g) => ({
    workspaceId: g.workspace.id,
    workspaceName: g.workspace.name,
    agentCount: g.rows.length,
    provider,
    runtime: pickRuntimeForBulkProvider(g.runtimes, provider, {
      userId,
      preferMode: dominantMode(g.rows),
    }),
  }));
}

function dominantMode(
  rows: { agent: { runtime_mode: AgentRuntimeMode } }[],
): AgentRuntimeMode | null {
  const counts = new Map<AgentRuntimeMode, number>();
  for (const row of rows) {
    const mode = row.agent.runtime_mode;
    counts.set(mode, (counts.get(mode) ?? 0) + 1);
  }
  let best: AgentRuntimeMode | null = null;
  let max = 0;
  for (const [mode, n] of counts) {
    if (n > max) {
      max = n;
      best = mode;
    }
  }
  return best;
}

export function dominantProviderFromRows(
  rows: { runtime: AgentRuntime | null }[],
): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const provider = row.runtime?.provider;
    if (!provider) continue;
    counts.set(provider, (counts.get(provider) ?? 0) + 1);
  }
  let best: string | null = null;
  let max = 0;
  for (const [provider, n] of counts) {
    if (n > max) {
      max = n;
      best = provider;
    }
  }
  return best;
}

/** First online mapped runtime, else any mapped runtime — for model discovery / test. */
export function pickBulkProbeRuntime(
  mappings: BulkRuntimeWorkspaceMapping[],
): AgentRuntime | null {
  const runtimes = mappings
    .map((m) => m.runtime)
    .filter((r): r is AgentRuntime => r != null);
  return runtimes.find((r) => r.status === "online") ?? runtimes[0] ?? null;
}
