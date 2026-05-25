import { describe, expect, it } from "vitest";
import type { AgentRuntime } from "../types";
import {
  buildBulkRuntimeMappings,
  collectBulkProviderOptions,
  pickRuntimeForBulkProvider,
} from "./resolve-bulk-runtime";

function rt(partial: Partial<AgentRuntime> & Pick<AgentRuntime, "id" | "name">): AgentRuntime {
  return {
    workspace_id: "ws-1",
    daemon_id: null,
    launch_header: "",
    status: "offline",
    device_info: "",
    metadata: {},
    owner_id: "user-a",
    visibility: "private",
    timezone: "UTC",
    last_seen_at: null,
    created_at: "",
    updated_at: "",
    runtime_mode: "local",
    provider: "claude",
    ...partial,
  };
}

describe("pickRuntimeForBulkProvider", () => {
  it("returns null when no runtime matches the provider", () => {
    const runtimes = [rt({ id: "1", name: "Claude", provider: "claude" })];
    expect(
      pickRuntimeForBulkProvider(runtimes, "codex", { userId: "user-a" }),
    ).toBeNull();
  });

  it("prefers online runtimes for the provider", () => {
    const runtimes = [
      rt({ id: "1", name: "Z-offline", provider: "codex", status: "offline" }),
      rt({ id: "2", name: "A-online", provider: "codex", status: "online" }),
    ];
    const picked = pickRuntimeForBulkProvider(runtimes, "codex", {
      userId: "user-a",
    });
    expect(picked?.id).toBe("2");
  });

  it("prefers matching runtime mode when multiple share a provider", () => {
    const runtimes = [
      rt({
        id: "1",
        name: "Local",
        provider: "cursor",
        runtime_mode: "local",
        status: "online",
      }),
      rt({
        id: "2",
        name: "Cloud",
        provider: "cursor",
        runtime_mode: "cloud",
        status: "online",
      }),
    ];
    const picked = pickRuntimeForBulkProvider(runtimes, "cursor", {
      userId: "user-a",
      preferMode: "cloud",
    });
    expect(picked?.id).toBe("2");
  });

  it("skips private runtimes owned by others", () => {
    const runtimes = [
      rt({
        id: "1",
        name: "Private",
        owner_id: "other",
        visibility: "private",
        status: "online",
      }),
      rt({
        id: "2",
        name: "Public",
        owner_id: "other",
        visibility: "public",
        status: "online",
      }),
    ];
    const picked = pickRuntimeForBulkProvider(runtimes, "claude", {
      userId: "user-a",
    });
    expect(picked?.id).toBe("2");
  });
});

describe("collectBulkProviderOptions", () => {
  it("returns unique bindable providers sorted", () => {
    const options = collectBulkProviderOptions(
      [
        {
          runtimes: [
            rt({ id: "1", name: "Codex", provider: "codex" }),
            rt({ id: "2", name: "Cursor", provider: "cursor" }),
          ],
        },
        {
          runtimes: [
            rt({ id: "3", name: "Codex-2", provider: "codex" }),
            rt({
              id: "4",
              name: "Private",
              provider: "hermes",
              owner_id: "other",
              visibility: "private",
            }),
          ],
        },
      ],
      "user-a",
    );
    expect(options).toEqual(["codex", "cursor"]);
  });
});

describe("buildBulkRuntimeMappings", () => {
  it("maps each workspace independently by provider", () => {
    const mappings = buildBulkRuntimeMappings(
      [
        {
          workspace: { id: "ws-1", name: "Alpha" },
          rows: [
            {
              agent: { runtime_mode: "local" },
              runtime: rt({ id: "r1", name: "A", provider: "cursor" }),
            },
          ],
          runtimes: [
            rt({ id: "r1", name: "A", provider: "cursor", status: "online" }),
          ],
        },
        {
          workspace: { id: "ws-2", name: "Beta" },
          rows: [{ agent: { runtime_mode: "local" }, runtime: null }],
          runtimes: [
            rt({ id: "r2", name: "B", provider: "cursor", status: "online" }),
          ],
        },
      ],
      "cursor",
      "user-a",
    );
    expect(mappings).toHaveLength(2);
    expect(mappings[0]?.runtime?.id).toBe("r1");
    expect(mappings[1]?.runtime?.id).toBe("r2");
  });
});
