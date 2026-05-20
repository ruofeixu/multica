"use client";

import { useRef, useState, useEffect } from "react";
import { cn } from "@multica/ui/lib/utils";
import { ContentEditor, type ContentEditorRef } from "../editor";
import { SubmitButton } from "@multica/ui/components/common/submit-button";

interface HubChatInputProps {
  onSend: (content: string) => void;
  onStop?: () => void;
  isRunning?: boolean;
  disabled?: boolean;
  agentName?: string;
  /** When set, fills the editor (e.g. after a retry-from). Pass new object ref to trigger. */
  fillContent?: { text: string; seq: number } | null;
}

export function HubChatInput({ onSend, onStop, isRunning, disabled, agentName, fillContent }: HubChatInputProps) {
  const editorRef = useRef<ContentEditorRef>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Fill editor when retry-from triggers
  useEffect(() => {
    if (!fillContent) return;
    editorRef.current?.setContent(fillContent.text);
    setIsEmpty(!fillContent.text.trim());
    editorRef.current?.focus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillContent]);

  const handleSend = () => {
    const content = editorRef.current?.getMarkdown()?.replace(/(\n\s*)+$/, "").trim();
    if (!content || isRunning || disabled) return;
    onSend(content);
    editorRef.current?.clearContent();
    setIsEmpty(true);
  };

  const placeholder = agentName ? `Tell ${agentName}…` : "Send a message…";

  return (
    <div className="px-3 pb-2 pt-0">
      <div
        className={cn(
          "relative mx-auto flex min-h-14 max-h-36 w-full flex-col rounded-lg bg-card pb-8 border border-border transition-colors focus-within:border-brand",
          disabled && "opacity-60 pointer-events-none",
        )}
      >
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
          <ContentEditor
            ref={editorRef}
            placeholder={placeholder}
            onUpdate={(md) => setIsEmpty(!md.trim())}
            onSubmit={handleSend}
            showBubbleMenu={false}
            submitOnEnter
          />
        </div>
        <div className="absolute bottom-1.5 right-2 flex items-center gap-1">
          <SubmitButton
            onClick={handleSend}
            disabled={isEmpty || !!disabled}
            running={isRunning}
            onStop={onStop}
          />
        </div>
      </div>
    </div>
  );
}
