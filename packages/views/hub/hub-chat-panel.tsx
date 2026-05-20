"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, ChevronDown, Plus, Check, ExternalLink } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@multica/ui/components/ui/dropdown-menu";
import { getApi } from "@multica/core/api";
import { chatKeys, chatSessionsOptions } from "@multica/core/chat/queries";
import { useMultiChatStore } from "@multica/core/chat";
import { paths } from "@multica/core/paths";
import { ChatMessageList, ChatMessageSkeleton } from "../chat/components/chat-message-list";
import { HubChatInput } from "./hub-chat-input";
import type { ChatMessage, ChatPendingTask } from "@multica/core/types";

interface HubChatPanelProps {
  panelId: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  projectName: string | null;
  agentId: string;
  agentName: string;
  sessionId: string | null;
}

export function HubChatPanel({
  panelId,
  workspaceId,
  workspaceSlug,
  workspaceName,
  projectName,
  agentId,
  agentName,
  sessionId,
}: HubChatPanelProps) {
  const qc = useQueryClient();
  const updatePanel = useMultiChatStore((s) => s.updatePanel);
  const removePanel = useMultiChatStore((s) => s.removePanel);

  const scopedApi = useCallback(() => getApi().withSlug(workspaceSlug), [workspaceSlug]);
  const fetchTaskMessages = useCallback(
    (taskId: string) => scopedApi().listTaskMessages(taskId),
    [scopedApi],
  );

  // History sessions for this agent
  const { data: allSessions = [] } = useQuery({
    ...chatSessionsOptions(workspaceId),
    queryFn: () => scopedApi().listChatSessions({ status: "all" }),
  });
  const agentSessions = allSessions.filter((s) => s.agent_id === agentId);

  // Messages — poll every 3s as fallback since WS events use getCurrentWsId()
  // which only covers the active workspace, not Hub's cross-workspace panels.
  const { data: messages = [], isPending: msgPending } = useQuery({
    queryKey: chatKeys.messages(sessionId ?? ""),
    queryFn: () => scopedApi().listChatMessages(sessionId!),
    enabled: !!sessionId,
    staleTime: Infinity,
    refetchInterval: 3000,
  });

  // Pending task — poll aggressively while a task is running
  const { data: pendingTask } = useQuery({
    queryKey: chatKeys.pendingTask(sessionId ?? ""),
    queryFn: () => scopedApi().getPendingChatTask(sessionId!),
    enabled: !!sessionId,
    staleTime: Infinity,
    refetchInterval: (query) => {
      const data = query.state.data as ChatPendingTask | undefined;
      // Poll fast while task is in-flight, slow otherwise
      return data?.task_id ? 1500 : 5000;
    },
  });

  const pendingTaskId = pendingTask?.task_id ?? null;
  const isRealTask = !!pendingTaskId && !pendingTaskId.startsWith("optimistic-");

  // Fetch task messages with scoped API — ChatMessageList's internal query
  // uses the global api singleton which would send the wrong workspace slug.
  const { data: taskMessages } = useQuery({
    queryKey: chatKeys.taskMessages(pendingTaskId ?? ""),
    queryFn: () => scopedApi().listTaskMessages(pendingTaskId!),
    enabled: isRealTask,
    staleTime: Infinity,
    refetchInterval: isRealTask ? 1500 : false,
  });

  const sessionPromiseRef = useRef<Promise<string | null> | null>(null);

  const ensureSession = useCallback(async (titleSeed: string): Promise<string | null> => {
    if (sessionId) return sessionId;
    if (sessionPromiseRef.current) return sessionPromiseRef.current;

    const promise = (async () => {
      try {
        const session = await scopedApi().createChatSession({
          agent_id: agentId,
          title: titleSeed.slice(0, 50),
        });
        updatePanel(panelId, { sessionId: session.id });
        qc.setQueryData<ChatMessage[]>(chatKeys.messages(session.id), []);
        qc.invalidateQueries({ queryKey: chatKeys.sessions(workspaceId) });
        return session.id;
      } finally {
        sessionPromiseRef.current = null;
      }
    })();
    sessionPromiseRef.current = promise;
    return promise;
  }, [sessionId, agentId, panelId, workspaceId, scopedApi, updatePanel, qc]);

  const handleSend = useCallback(async (content: string) => {
    const sid = await ensureSession(content);
    if (!sid) return;

    const sentAt = new Date().toISOString();
    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      chat_session_id: sid,
      role: "user",
      content,
      task_id: null,
      created_at: sentAt,
    };
    qc.setQueryData<ChatMessage[]>(
      chatKeys.messages(sid),
      (old) => (old ? [...old, optimistic] : [optimistic]),
    );
    qc.setQueryData<ChatPendingTask>(chatKeys.pendingTask(sid), {
      task_id: `optimistic-${optimistic.id}`,
      status: "queued",
      created_at: sentAt,
    });

    const result = await scopedApi().sendChatMessage(sid, content);
    qc.setQueryData<ChatPendingTask>(chatKeys.pendingTask(sid), {
      task_id: result.task_id,
      status: "queued",
      created_at: result.created_at,
    });
    qc.invalidateQueries({ queryKey: chatKeys.messages(sid) });
  }, [ensureSession, scopedApi, qc]);

  const handleStop = useCallback(() => {
    if (!pendingTaskId || !sessionId) return;
    qc.setQueryData(chatKeys.pendingTask(sessionId), {});
    scopedApi().cancelTaskById(pendingTaskId).catch(() => {});
  }, [pendingTaskId, sessionId, scopedApi, qc]);

  // Retry from a specific message: truncate + refill input
  const [retryFill, setRetryFill] = useState<{ text: string; seq: number } | null>(null);

  const handleRetryFrom = useCallback(async (messageId: string, content: string) => {
    if (!sessionId) return;
    try {
      await scopedApi().truncateChatMessages(sessionId, messageId);
      qc.invalidateQueries({ queryKey: chatKeys.messages(sessionId) });
    } catch {
      return;
    }
    setRetryFill({ text: content, seq: Date.now() });
  }, [sessionId, scopedApi, qc]);

  const activeSession = agentSessions.find((s) => s.id === sessionId);
  const hasMessages = messages.length > 0 || !!pendingTaskId;

  return (
    <div className="flex flex-col h-full min-h-[400px] border border-border rounded-lg overflow-hidden bg-sidebar">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-sidebar-accent/30 shrink-0 gap-2">
        <div className="flex items-center gap-1 min-w-0 flex-1">
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium truncate">{agentName}</span>
            <span className="text-[10px] text-muted-foreground truncate">
              {workspaceName}{projectName ? ` · ${projectName}` : ""}
            </span>
          </div>
          <a
            href={paths.workspace(workspaceSlug).agentDetail(agentId)}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            title="Open agent settings"
          >
            <ExternalLink className="size-3" />
          </a>
        </div>

        {/* Session picker */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0 max-w-32">
            <span className="truncate">
              {activeSession?.title || (sessionId ? "Untitled" : "New chat")}
            </span>
            <ChevronDown className="size-3 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 max-h-64 overflow-y-auto">
            <DropdownMenuItem
              onClick={() => updatePanel(panelId, { sessionId: null })}
              className="gap-2"
            >
              <Plus className="size-3.5 shrink-0" />
              <span>New chat</span>
              {!sessionId && <Check className="size-3.5 ml-auto" />}
            </DropdownMenuItem>

            {agentSessions.length > 0 && <DropdownMenuSeparator />}

            {agentSessions.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onClick={() => updatePanel(panelId, { sessionId: s.id })}
                className="gap-2"
              >
                <span className="flex-1 truncate text-xs">
                  {s.title || "Untitled"}
                </span>
                {s.id === sessionId && <Check className="size-3.5 shrink-0" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground"
          onClick={() => removePanel(panelId)}
        >
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Messages */}
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0 flex flex-col">
          {sessionId && msgPending ? (
            <ChatMessageSkeleton />
          ) : hasMessages ? (
            <ChatMessageList
              messages={messages}
              pendingTask={pendingTask ?? null}
              availability={undefined}
              onRetryFrom={handleRetryFrom}
              liveTaskMessages={taskMessages}
              fetchTaskMessages={fetchTaskMessages}
              workspaceSlug={workspaceSlug}
              workspaceId={workspaceId}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Start a conversation with {agentName}
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <HubChatInput
        onSend={handleSend}
        onStop={handleStop}
        isRunning={!!pendingTaskId}
        agentName={agentName}
        fillContent={retryFill}
      />
    </div>
  );
}
