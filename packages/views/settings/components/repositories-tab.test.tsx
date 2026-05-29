import type { ReactNode } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@multica/core/i18n/react";
import enCommon from "../../locales/en/common.json";
import enSettings from "../../locales/en/settings.json";

const mockUpdateWorkspace = vi.hoisted(() => vi.fn());
const workspaceRef = vi.hoisted(() => ({
  current: {
    id: "workspace-1",
    name: "Test Workspace",
    slug: "test-workspace",
    repos: [{ url: "https://github.com/multica-ai/multica" }] as {
      url: string;
      local_path?: string;
    }[],
  },
}));
const membersRef = vi.hoisted(() => ({
  current: [{ user_id: "user-1", role: "owner" as const }],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: membersRef.current }),
  useQueryClient: () => ({ setQueryData: vi.fn() }),
}));

vi.mock("@multica/core/hooks", () => ({
  useWorkspaceId: () => "workspace-1",
}));

vi.mock("@multica/core/paths", () => ({
  useCurrentWorkspace: () => workspaceRef.current,
}));

vi.mock("@multica/core/workspace/queries", () => ({
  memberListOptions: () => ({ queryKey: ["members"], queryFn: vi.fn() }),
  workspaceKeys: { list: () => ["workspaces"] },
}));

vi.mock("@multica/core/api", () => ({
  api: { updateWorkspace: mockUpdateWorkspace },
}));

vi.mock("@multica/core/auth", () => {
  const useAuthStore = Object.assign(
    (sel?: (s: { user: { id: string } }) => unknown) =>
      sel ? sel({ user: { id: "user-1" } }) : { user: { id: "user-1" } },
    { getState: () => ({ user: { id: "user-1" } }) },
  );
  return { useAuthStore };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { RepositoriesTab } from "./repositories-tab";

const TEST_RESOURCES = {
  en: { common: enCommon, settings: enSettings },
};

function I18nWrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      {children}
    </I18nProvider>
  );
}

function urlInputs() {
  return screen
    .getAllByRole("textbox")
    .filter((el) => (el as HTMLInputElement).type === "url") as HTMLInputElement[];
}

describe("RepositoriesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceRef.current = {
      id: "workspace-1",
      name: "Test Workspace",
      slug: "test-workspace",
      repos: [{ url: "https://github.com/multica-ai/multica" }],
    };
    membersRef.current = [{ user_id: "user-1", role: "owner" }];
  });

  it("renders persisted repo URL and optional local path inputs", () => {
    render(<RepositoriesTab />, { wrapper: I18nWrapper });
    expect(urlInputs()[0]!.value).toBe("https://github.com/multica-ai/multica");
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
  });

  it("hides Save when repos are unchanged", () => {
    render(<RepositoriesTab />, { wrapper: I18nWrapper });
    expect(screen.queryByRole("button", { name: /^Save$/ })).toBeNull();
  });

  it("shows Save after editing a repo URL", async () => {
    const user = userEvent.setup();
    render(<RepositoriesTab />, { wrapper: I18nWrapper });

    await user.clear(urlInputs()[0]!);
    await user.type(urlInputs()[0]!, "https://github.com/multica-ai/edited");

    expect(screen.getByRole("button", { name: /^Save$/ })).toBeTruthy();
  });

  it("persists edited repos on Save", async () => {
    const user = userEvent.setup();
    mockUpdateWorkspace.mockImplementation(
      async (_id: string, payload: { repos: { url: string; local_path?: string }[] }) => ({
        ...workspaceRef.current,
        repos: payload.repos,
      }),
    );

    render(<RepositoriesTab />, { wrapper: I18nWrapper });

    await user.clear(urlInputs()[0]!);
    await user.type(urlInputs()[0]!, "https://github.com/multica-ai/edited");
    await user.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => {
      expect(mockUpdateWorkspace).toHaveBeenCalledWith("workspace-1", {
        repos: [{ url: "https://github.com/multica-ai/edited" }],
      });
    });
  });

  it("adds a new empty repo row", async () => {
    const user = userEvent.setup();
    render(<RepositoriesTab />, { wrapper: I18nWrapper });

    await user.click(screen.getByRole("button", { name: /Add repository/ }));

    expect(screen.getAllByRole("textbox")).toHaveLength(4);
    expect(urlInputs()[1]!.value).toBe("");
  });

  it("removes a repo row via delete", async () => {
    const user = userEvent.setup();
    render(<RepositoriesTab />, { wrapper: I18nWrapper });

    await user.click(screen.getByRole("button", { name: /Add repository/ }));
    expect(urlInputs()).toHaveLength(2);

    const deleteButtons = screen.getAllByRole("button").filter((btn) =>
      btn.querySelector(".lucide-trash2"),
    );
    await user.click(deleteButtons[1]!);

    expect(urlInputs()).toHaveLength(1);
    expect(urlInputs()[0]!.value).toBe("https://github.com/multica-ai/multica");
  });

  it("includes local_path in save payload", async () => {
    const user = userEvent.setup();
    mockUpdateWorkspace.mockImplementation(
      async (_id: string, payload: { repos: { url: string; local_path?: string }[] }) => ({
        ...workspaceRef.current,
        repos: payload.repos,
      }),
    );

    render(<RepositoriesTab />, { wrapper: I18nWrapper });

    const localPathInput = screen.getAllByRole("textbox").find(
      (el) => (el as HTMLInputElement).placeholder.includes("Local path"),
    ) as HTMLInputElement;
    await user.type(localPathInput, "/Users/you/project");
    await user.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => {
      expect(mockUpdateWorkspace).toHaveBeenCalledWith("workspace-1", {
        repos: [
          {
            url: "https://github.com/multica-ai/multica",
            local_path: "/Users/you/project",
          },
        ],
      });
    });
  });
});
