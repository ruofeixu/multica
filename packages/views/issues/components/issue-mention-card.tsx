"use client";

import { AppLink } from "../../navigation";
import { paths, useWorkspaceSlug } from "@multica/core/paths";
import { IssueChip } from "./issue-chip";

interface IssueMentionCardProps {
  issueId: string;
  /** Fallback text when issue is not in store (e.g. "MUL-7") */
  fallbackLabel?: string;
  /** Required on global routes (e.g. /hub) where URL has no workspace slug. */
  workspaceSlug?: string;
  workspaceId?: string;
}

/**
 * Navigable chip — wraps IssueChip in an AppLink pointing at the issue's
 * detail page. Hover/cursor affordance is layered onto the chip itself so
 * the visual target matches the clickable target.
 */
export function IssueMentionCard({
  issueId,
  fallbackLabel,
  workspaceSlug,
  workspaceId,
}: IssueMentionCardProps) {
  const routeSlug = useWorkspaceSlug();
  const slug = workspaceSlug ?? routeSlug;
  const chipProps = {
    issueId,
    fallbackLabel,
    workspaceSlug,
    workspaceId,
  };
  if (!slug) {
    return (
      <span className="issue-mention not-prose inline-flex">
        <IssueChip {...chipProps} />
      </span>
    );
  }
  const href = paths.workspace(slug).issueDetail(issueId);
  return (
    <AppLink href={href} className="issue-mention not-prose inline-flex">
      <IssueChip
        {...chipProps}
        className="cursor-pointer hover:bg-accent transition-colors"
      />
    </AppLink>
  );
}
