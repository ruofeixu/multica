"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@multica/ui/components/ui/input";
import { Button } from "@multica/ui/components/ui/button";
import { Card, CardContent } from "@multica/ui/components/ui/card";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@multica/core/auth";
import { useWorkspaceId } from "@multica/core/hooks";
import { useCurrentWorkspace } from "@multica/core/paths";
import { memberListOptions, workspaceKeys } from "@multica/core/workspace/queries";
import { api } from "@multica/core/api";
import type { Workspace, WorkspaceRepo } from "@multica/core/types";
import { useT } from "../../i18n";

function isDirty(local: WorkspaceRepo[], saved: WorkspaceRepo[]): boolean {
  if (local.length !== saved.length) return true;
  return local.some(
    (r, i) =>
      r.url !== saved[i]?.url ||
      (r.local_path ?? "") !== (saved[i]?.local_path ?? ""),
  );
}

export function RepositoriesTab() {
  const { t } = useT("settings");
  const user = useAuthStore((s) => s.user);
  const workspace = useCurrentWorkspace();
  const wsId = useWorkspaceId();
  const qc = useQueryClient();
  const { data: members = [] } = useQuery(memberListOptions(wsId));

  const [repos, setRepos] = useState<WorkspaceRepo[]>(workspace?.repos ?? []);
  const [saving, setSaving] = useState(false);

  const currentMember = members.find((m) => m.user_id === user?.id) ?? null;
  const canManageWorkspace = currentMember?.role === "owner" || currentMember?.role === "admin";

  useEffect(() => {
    setRepos(workspace?.repos ?? []);
  }, [workspace]);

  const savedRepos = workspace?.repos ?? [];
  const dirty = isDirty(repos, savedRepos);

  const handleSave = async () => {
    if (!workspace) return;
    setSaving(true);
    try {
      const updated = await api.updateWorkspace(workspace.id, { repos });
      qc.setQueryData(workspaceKeys.list(), (old: Workspace[] | undefined) =>
        old?.map((ws) => (ws.id === updated.id ? updated : ws)),
      );
      toast.success(t(($) => $.repositories.toast_saved));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t(($) => $.repositories.toast_save_failed));
    } finally {
      setSaving(false);
    }
  };

  const handleAddRepo = () => {
    setRepos([...repos, { url: "" }]);
  };

  const handleRemoveRepo = (index: number) => {
    setRepos(repos.filter((_, i) => i !== index));
  };

  const handleRepoUrlChange = (index: number, value: string) => {
    setRepos(repos.map((r, i) => (i === index ? { ...r, url: value } : r)));
  };

  const handleRepoLocalPathChange = (index: number, value: string) => {
    setRepos(repos.map((r, i) => (i === index ? { ...r, local_path: value || undefined } : r)));
  };

  if (!workspace) return null;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">{t(($) => $.repositories.section_title)}</h2>

        <Card>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {t(($) => $.repositories.description)}
            </p>

            {repos.map((repo, index) => (
              <div key={index} className="flex items-start gap-2">
                <div className="flex flex-1 min-w-0 flex-col gap-1.5">
                  <Input
                    type="url"
                    value={repo.url}
                    onChange={(e) => handleRepoUrlChange(index, e.target.value)}
                    disabled={!canManageWorkspace}
                    placeholder={t(($) => $.repositories.url_placeholder)}
                    className="text-sm"
                  />
                  <Input
                    type="text"
                    value={repo.local_path ?? ""}
                    onChange={(e) => handleRepoLocalPathChange(index, e.target.value)}
                    disabled={!canManageWorkspace}
                    placeholder="Local path (optional): /Users/you/project"
                    className="text-sm font-mono text-xs"
                  />
                </div>
                {canManageWorkspace && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemoveRepo(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}

            {canManageWorkspace && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleAddRepo}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t(($) => $.repositories.add)}
                </Button>
                {dirty && (
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? t(($) => $.repositories.saving) : t(($) => $.repositories.save)}
                  </Button>
                )}
              </div>
            )}

            {!canManageWorkspace && (
              <p className="text-xs text-muted-foreground">
                {t(($) => $.repositories.manage_hint)}
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
