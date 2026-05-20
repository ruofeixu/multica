import { create } from "zustand";
import { persist } from "zustand/middleware";

export type GridLayout = "2x2" | "2x4" | "2x6";

/** cols × rows for each layout option */
export const GRID_DIMENSIONS: Record<GridLayout, { cols: number; rows: number }> = {
  "2x2": { cols: 2, rows: 2 },
  "2x4": { cols: 2, rows: 4 },
  "2x6": { cols: 2, rows: 6 },
};

export interface HubPanel {
  id: string;
  /** Workspace UUID */
  workspaceId: string;
  workspaceSlug: string;
  projectId: string | null;
  /** Display name for the project (snapshot at add time) */
  projectName: string | null;
  agentId: string | null;
  /** Display name for the agent (snapshot at add time) */
  agentName: string | null;
  /** Active chat session UUID, null = new chat */
  sessionId: string | null;
}

interface MultiChatState {
  panels: HubPanel[];
  layout: GridLayout;
  setLayout: (layout: GridLayout) => void;
  addPanel: (panel: Omit<HubPanel, "id">) => void;
  updatePanel: (id: string, patch: Partial<Omit<HubPanel, "id">>) => void;
  removePanel: (id: string) => void;
  clearPanels: () => void;
}

let _counter = 0;
function nextId() {
  return `panel-${Date.now()}-${++_counter}`;
}

export const useMultiChatStore = create<MultiChatState>()(
  persist(
    (set) => ({
      panels: [],
      layout: "2x2",
      setLayout: (layout) => set({ layout }),
      addPanel: (panel) =>
        set((s) => ({ panels: [...s.panels, { ...panel, id: nextId() }] })),
      updatePanel: (id, patch) =>
        set((s) => ({
          panels: s.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      removePanel: (id) =>
        set((s) => ({ panels: s.panels.filter((p) => p.id !== id) })),
      clearPanels: () => set({ panels: [] }),
    }),
    {
      name: "multica:hub:multi-chat",
      // Only persist layout + panel identities (not transient session state)
      partialize: (s) => ({ layout: s.layout, panels: s.panels }),
    },
  ),
);
