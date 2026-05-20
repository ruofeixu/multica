import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HubPage } from "./hub-page";

vi.mock("@multica/core/workspace/queries", () => ({
  workspaceListOptions: () => ({
    queryKey: ["workspaces", "list"],
    queryFn: async () => [],
  }),
  agentListOptions: () => ({
    queryKey: ["workspaces", "ws-1", "agents"],
    queryFn: async () => [],
  }),
}));

vi.mock("@multica/core/projects/queries", () => ({
  projectListOptions: () => ({
    queryKey: ["projects", "ws-1", "list"],
    queryFn: async () => ({ projects: [], total: 0 }),
    select: (data: { projects: unknown[] }) => data.projects,
  }),
}));

vi.mock("@multica/core/api", () => ({
  getApi: () => ({
    withSlug: () => ({
      listProjects: async () => ({ projects: [], total: 0 }),
      listAgents: async () => [],
    }),
  }),
}));

vi.mock("@multica/core/chat", () => ({
  useMultiChatStore: Object.assign(
    (selector: (s: { panels: []; layout: "2x2"; setLayout: () => void; addPanel: () => void; clearPanels: () => void }) => unknown) =>
      selector({
        panels: [],
        layout: "2x2",
        setLayout: vi.fn(),
        addPanel: vi.fn(),
        clearPanels: vi.fn(),
      }),
    {
      getState: () => ({
        panels: [],
        layout: "2x2",
        setLayout: vi.fn(),
        addPanel: vi.fn(),
        clearPanels: vi.fn(),
      }),
    },
  ),
}));

vi.mock("./hub-chat-panel", () => ({
  HubChatPanel: () => <div data-testid="hub-chat-panel" />,
}));

function renderHub() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <HubPage />
    </QueryClientProvider>,
  );
}

describe("HubPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders hub shell without crashing", () => {
    renderHub();
    expect(screen.getByRole("heading", { name: "Hub" })).toBeInTheDocument();
    expect(screen.getByText("Multi-workspace chat")).toBeInTheDocument();
    expect(
      screen.getByText("Select a project and agent from the left panel to open a chat"),
    ).toBeInTheDocument();
  });

  it("shows layout switcher and clear all controls", () => {
    renderHub();
    expect(screen.getByRole("button", { name: "2x2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear all/i })).toBeInTheDocument();
  });
});
