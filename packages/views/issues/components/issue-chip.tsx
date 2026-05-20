"use client";

import { useQuery } from "@tanstack/react-query";
import { issueKeys, issueListOptions } from "@multica/core/issues/queries";
import { api, getApi } from "@multica/core/api";
import { useCurrentWorkspace } from "@multica/core/paths";
import { StatusIcon } from "./status-icon";

/**
 * Compact, presentation-only representation of an issue —
 * `<StatusIcon> <identifier> <title>`, bordered, truncating to max-w-72.
 *
 * This is the single source of truth for the "issue-mention card" look.
 * It is intentionally **not** a link or button: callers wrap it in whatever
 * interactive shell they need (AppLink for markdown mentions, an <a> with
 * cmd-click support inside the editor's NodeView, a plain span next to a
 * dismiss button in chat's context anchor card, …).
 *
 * Size budget: must fit within a 14px line-box when used inline — hence
 * `py-0.5` + text-xs (see MentionView docstring for the math).
 */
export interface IssueChipProps {
  issueId: string;
  /** Shown when the issue can't be resolved (deleted, other workspace, …). */
  fallbackLabel?: string;
  /** Extra classes — callers layer interaction hints here
   *  (e.g. `hover:bg-accent cursor-pointer` for navigable variants). */
  className?: string;
  /** Required on global routes (e.g. /hub) where URL has no workspace context. */
  workspaceId?: string;
  workspaceSlug?: string;
}

const BASE_CLASS =
  "issue-mention inline-flex items-center gap-1.5 rounded-md border mx-0.5 px-2 py-0.5 text-xs max-w-72";

export function IssueChip({
  issueId,
  fallbackLabel,
  className,
  workspaceId: workspaceIdProp,
  workspaceSlug,
}: IssueChipProps) {
  const routeWs = useCurrentWorkspace();
  const wsId = workspaceIdProp ?? routeWs?.id;
  // Hub panels pass slug+id but the route has no workspace — skip the heavy
  // list query (uses global api) and fetch this issue directly with withSlug.
  const hubScope = !!workspaceSlug && !routeWs;

  const { data: issues = [] } = useQuery({
    ...issueListOptions(wsId ?? ""),
    enabled: !!wsId && !hubScope,
  });
  const listIssue = issues.find((i) => i.id === issueId);

  const { data: detailIssue } = useQuery({
    queryKey: issueKeys.detail(wsId ?? "", issueId),
    queryFn: () =>
      hubScope
        ? getApi().withSlug(workspaceSlug!).getIssue(issueId)
        : api.getIssue(issueId),
    enabled: !!wsId && (hubScope || !listIssue),
  });

  const issue = listIssue ?? detailIssue;
  const cls = className ? `${BASE_CLASS} ${className}` : BASE_CLASS;

  if (!issue) {
    return (
      <span className={cls}>
        <span className="font-medium text-muted-foreground">
          {fallbackLabel ?? issueId.slice(0, 8)}
        </span>
      </span>
    );
  }

  return (
    <span className={cls}>
      <StatusIcon status={issue.status} className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium text-muted-foreground shrink-0">
        {issue.identifier}
      </span>
      <span className="text-foreground truncate">{issue.title}</span>
    </span>
  );
}
