"use client";

import type { AgentRuntime } from "@multica/core/types";
import { ModelDropdown } from "./model-dropdown";
import { useT } from "../../i18n";

export function AgentsDirectoryBatchModelField({
  probeRuntime,
  workspaceName,
  value,
  onChange,
}: {
  probeRuntime: AgentRuntime | null;
  workspaceName: string | null;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useT("agents");
  const runtimeOnline = probeRuntime?.status === "online";

  return (
    <div className="space-y-2">
      <ModelDropdown
        runtimeId={probeRuntime?.id ?? null}
        runtimeOnline={runtimeOnline}
        value={value}
        onChange={onChange}
        disabled={false}
      />
      {probeRuntime && workspaceName ? (
        <p className="text-[11px] text-muted-foreground">
          {t(($) => $.directory.batch_model_source_hint, {
            runtime: probeRuntime.name,
            workspace: workspaceName,
          })}
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          {t(($) => $.directory.batch_model_manual_hint)}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {t(($) => $.directory.batch_model_hint)}
      </p>
    </div>
  );
}
