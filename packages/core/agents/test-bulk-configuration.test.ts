import { describe, expect, it, vi } from "vitest";
import type { AgentRuntime } from "../types";
import { testBulkAgentConfiguration } from "./test-bulk-configuration";

vi.mock("../runtimes/models", () => ({
  resolveRuntimeModels: vi.fn(),
}));

import { resolveRuntimeModels } from "../runtimes/models";

const mockedResolve = vi.mocked(resolveRuntimeModels);

function rt(partial: Partial<AgentRuntime> & Pick<AgentRuntime, "id" | "name">): AgentRuntime {
  return {
    workspace_id: "ws-1",
    daemon_id: null,
    launch_header: "",
    status: "online",
    device_info: "",
    metadata: {},
    owner_id: "user-a",
    visibility: "private",
    timezone: "UTC",
    last_seen_at: null,
    created_at: "",
    updated_at: "",
    runtime_mode: "local",
    provider: "codex",
    ...partial,
  };
}

describe("testBulkAgentConfiguration", () => {
  it("returns no_runtime when probe is missing", async () => {
    await expect(testBulkAgentConfiguration(null, "")).resolves.toEqual({
      ok: false,
      kind: "no_runtime",
    });
  });

  it("returns offline when probe runtime is not online", async () => {
    await expect(
      testBulkAgentConfiguration(rt({ id: "r1", name: "Codex", status: "offline" }), ""),
    ).resolves.toEqual({
      ok: false,
      kind: "offline",
      runtimeName: "Codex",
    });
  });

  it("returns managed_by_runtime when provider ignores model selection", async () => {
    mockedResolve.mockResolvedValueOnce({ models: [], supported: false });
    await expect(
      testBulkAgentConfiguration(rt({ id: "r1", name: "Hermes" }), "any"),
    ).resolves.toEqual({
      ok: true,
      kind: "managed_by_runtime",
      runtimeName: "Hermes",
    });
  });

  it("returns models result with match flag", async () => {
    mockedResolve.mockResolvedValueOnce({
      supported: true,
      models: [{ id: "claude-sonnet", label: "Sonnet", provider: "anthropic" }],
    });
    await expect(
      testBulkAgentConfiguration(rt({ id: "r1", name: "Codex" }), "claude-sonnet"),
    ).resolves.toEqual({
      ok: true,
      kind: "models",
      runtimeName: "Codex",
      modelCount: 1,
      modelMatched: true,
    });
  });

  it("allows custom models not in catalog", async () => {
    mockedResolve.mockResolvedValueOnce({
      supported: true,
      models: [{ id: "known", label: "Known", provider: "openai" }],
    });
    await expect(
      testBulkAgentConfiguration(rt({ id: "r1", name: "Codex" }), "custom-model"),
    ).resolves.toMatchObject({
      ok: true,
      kind: "models",
      modelMatched: false,
    });
  });
});
