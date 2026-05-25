import type { AgentRuntime } from "../types";
import { resolveRuntimeModels } from "../runtimes/models";

export type BulkConfigurationTestResult =
  | {
      ok: true;
      kind: "models";
      runtimeName: string;
      modelCount: number;
      modelMatched: boolean;
    }
  | { ok: true; kind: "managed_by_runtime"; runtimeName: string }
  | {
      ok: false;
      kind: "offline" | "discovery_failed" | "no_runtime";
      runtimeName?: string;
      error?: string;
    };

/** Probe one mapped runtime (model discovery) to validate bulk config. */
export async function testBulkAgentConfiguration(
  probeRuntime: AgentRuntime | null,
  model: string,
): Promise<BulkConfigurationTestResult> {
  if (!probeRuntime) {
    return { ok: false, kind: "no_runtime" };
  }
  if (probeRuntime.status !== "online") {
    return { ok: false, kind: "offline", runtimeName: probeRuntime.name };
  }

  try {
    const result = await resolveRuntimeModels(probeRuntime.id);
    if (!result.supported) {
      return {
        ok: true,
        kind: "managed_by_runtime",
        runtimeName: probeRuntime.name,
      };
    }

    const trimmed = model.trim();
    const modelMatched =
      trimmed === "" ||
      result.models.some((m) => m.id === trimmed || m.label === trimmed);

    return {
      ok: true,
      kind: "models",
      runtimeName: probeRuntime.name,
      modelCount: result.models.length,
      modelMatched,
    };
  } catch (err) {
    return {
      ok: false,
      kind: "discovery_failed",
      runtimeName: probeRuntime.name,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}
