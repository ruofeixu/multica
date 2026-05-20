"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus, LayoutGrid, Trash2 } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { workspaceListOptions, agentListOptions } from "@multica/core/workspace/queries";
import { projectListOptions } from "@multica/core/projects/queries";
import { getApi } from "@multica/core/api";
import { useMultiChatStore, type GridLayout } from "@multica/core/chat";
import { HubChatPanel } from "./hub-chat-panel";
import type { Workspace } from "@multica/core/types";

// ─── Layout switcher ─────────────────────────────────────────────────────────

const LAYOUTS: GridLayout[] = ["2x2", "2x4", "2x6"];

function LayoutSwitcher() {
  const layout = useMultiChatStore((s) => s.layout);
  const setLayout = useMultiChatStore((s) => s.setLayout);
  return (
    <div className="flex items-center gap-1">
      {LAYOUTS.map((l) => (
        <Button
          key={l}
          variant={layout === l ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setLayout(l)}
        >
          {l}
        </Button>
      ))}
    </div>
  );
}

// ─── Workspace tree ───────────────────────────────────────────────────────────

interface AddPanelOpts {
  workspaceId: string;
  workspaceSlug: string;
  projectId: string | null;
  projectName: string | null;
  agentId: string;
  agentName: string;
}

function WorkspaceNode({
  workspace,
  onAddPanel,
}: {
  workspace: Workspace;
  onAddPanel: (opts: AddPanelOpts) => void;
}) {
  const [open, setOpen] = useState(false);

  const { data: projects = [] } = useQuery({
    ...projectListOptions(workspace.id),
    enabled: open,
    queryFn: () => getApi().withSlug(workspace.slug).listProjects(),
  });

  const { data: agents = [] } = useQuery({
    ...agentListOptions(workspace.id),
    enabled: open,
    queryFn: () =>
      getApi()
        .withSlug(workspace.slug)
        .listAgents({ workspace_id: workspace.id, include_archived: true }),
  });

  const activeAgents = agents.filter((a) => !a.archived_at);

  return (
    <div>
      <button
        className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-sm hover:bg-accent transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
        <span className="font-medium truncate">{workspace.name}</span>
      </button>

      {open && (
        <div className="ml-4 mt-0.5 space-y-0.5">
          {projects.length === 0 && activeAgents.length === 0 && (
            <p className="px-2 py-1 text-xs text-muted-foreground">No projects or agents</p>
          )}

          {projects.map((project) => (
            <ProjectNode
              key={project.id}
              projectTitle={project.title}
              agents={activeAgents}
              onAdd={(agentId, agentName) =>
                onAddPanel({
                  workspaceId: workspace.id,
                  workspaceSlug: workspace.slug,
                  projectId: project.id,
                  projectName: project.title,
                  agentId,
                  agentName,
                })
              }
            />
          ))}

          {activeAgents.length > 0 && (
            <div>
              <p className="px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">
                No project
              </p>
              {activeAgents.map((agent) => (
                <button
                  key={agent.id}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-accent transition-colors"
                  onClick={() =>
                    onAddPanel({
                      workspaceId: workspace.id,
                      workspaceSlug: workspace.slug,
                      projectId: null,
                      projectName: null,
                      agentId: agent.id,
                      agentName: agent.name,
                    })
                  }
                >
                  <Plus className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{agent.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectNode({
  projectTitle,
  agents,
  onAdd,
}: {
  projectTitle: string;
  agents: { id: string; name: string }[];
  onAdd: (agentId: string, agentName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-accent transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <span className="truncate">{projectTitle}</span>
      </button>
      {open && (
        <div className="ml-4 space-y-0.5">
          {agents.length === 0 && (
            <p className="px-2 py-1 text-[10px] text-muted-foreground">No agents</p>
          )}
          {agents.map((agent) => (
            <button
              key={agent.id}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-[11px] hover:bg-accent transition-colors"
              onClick={() => onAdd(agent.id, agent.name)}
            >
              <Plus className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{agent.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Panel grid ───────────────────────────────────────────────────────────────

function PanelGrid() {
  const panels = useMultiChatStore((s) => s.panels);
  const { data: workspaces = [] } = useQuery(workspaceListOptions());
  const wsMap = new Map(workspaces.map((w) => [w.id, w]));

  if (panels.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        <div className="text-center space-y-2">
          <LayoutGrid className="size-8 mx-auto opacity-30" />
          <p>Select a project and agent from the left panel to open a chat</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid h-full gap-2 p-2"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gridAutoRows: "1fr",
      }}
    >
      {panels.map((panel) => {
        const ws = wsMap.get(panel.workspaceId);
        if (!ws || !panel.agentId) return null;
        return (
          <HubChatPanel
            key={panel.id}
            panelId={panel.id}
            workspaceId={panel.workspaceId}
            workspaceSlug={panel.workspaceSlug}
            workspaceName={ws.name}
            projectName={panel.projectName}
            agentId={panel.agentId}
            agentName={panel.agentName ?? panel.agentId}
            sessionId={panel.sessionId}
          />
        );
      })}
    </div>
  );
}

// ─── Hub page ─────────────────────────────────────────────────────────────────

export function HubPage() {
  const { data: workspaces = [], isPending: workspacesLoading } = useQuery(workspaceListOptions());
  const addPanel = useMultiChatStore((s) => s.addPanel);
  const clearPanels = useMultiChatStore((s) => s.clearPanels);

  const handleAddPanel = (opts: AddPanelOpts) => {
    addPanel({
      workspaceId: opts.workspaceId,
      workspaceSlug: opts.workspaceSlug,
      projectId: opts.projectId,
      projectName: opts.projectName,
      agentId: opts.agentId,
      agentName: opts.agentName,
      sessionId: null,
    });
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left sidebar */}
      <aside className="w-56 shrink-0 border-r flex flex-col overflow-hidden">
        <div className="px-3 py-2.5 border-b">
          <h2 className="text-sm font-semibold">Hub</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">Multi-workspace chat</p>
        </div>
        <div className="flex-1 overflow-y-auto py-1 px-1 space-y-0.5">
          {workspaces.map((ws) => (
            <WorkspaceNode key={ws.id} workspace={ws} onAddPanel={handleAddPanel} />
          ))}
          {workspacesLoading && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Loading workspaces…</p>
          )}
          {!workspacesLoading && workspaces.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No workspaces</p>
          )}
        </div>
      </aside>

      {/* Right: toolbar + grid */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-b shrink-0">
          <LayoutSwitcher />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={clearPanels}
          >
            <Trash2 className="size-3.5 mr-1" />
            Clear all
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <PanelGrid />
        </div>
      </div>
    </div>
  );
}
