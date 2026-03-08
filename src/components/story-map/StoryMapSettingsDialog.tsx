'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DangerZone } from '@/components/ui/danger-zone';
import { DeleteButton } from '@/components/ui/delete-button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorMessage } from '@/lib/errors';
import { fetchJson } from '@/lib/http';

interface StoryMapLinearSettingsResponse {
  story_map_id: string;
  team_id: string;
  can_edit: boolean;
  team_settings: {
    linear_team_id: string | null;
    linear_state_id: string | null;
  };
  story_map_settings: {
    linear_project_id: string | null;
    linear_state_id: string | null;
    auto_import_labeled_issues: boolean;
    import_label_name: string;
    updated_at: string | null;
  };
  effective_settings: {
    linear_project_id: string | null;
    linear_state_id: string | null;
    auto_import_labeled_issues: boolean;
    import_label_name: string;
  };
}

interface LinearOptionsResponse {
  connected: boolean;
  options: {
    teams: Array<{ id: string; name: string; key: string | null }>;
    projects: Array<{ id: string; name: string; teamIds: string[] }>;
    states: Array<{ id: string; name: string; type: string | null; teamId: string }>;
  };
}

function asInputValue(value: string | null | undefined): string {
  return value ?? '';
}

function asNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function StoryMapSettingsDialog({
  open,
  onOpenChange,
  storyMapId,
  storyMapName,
  onSyncComplete,
  onDeleteStoryMap,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storyMapId: string;
  storyMapName: string;
  onSyncComplete?: () => void;
  onDeleteStoryMap?: () => Promise<void>;
}) {
  const NO_SELECTION = '__none__';
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deletingStoryMap, setDeletingStoryMap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamLinearTeamId, setTeamLinearTeamId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [stateId, setStateId] = useState('');
  const [autoImportLabeledIssues, setAutoImportLabeledIssues] = useState(true);
  const [importLabelName, setImportLabelName] = useState('Story');
  const [effectiveProjectId, setEffectiveProjectId] = useState<string | null>(null);
  const [effectiveStateId, setEffectiveStateId] = useState<string | null>(null);
  const [effectiveAutoImportLabeledIssues, setEffectiveAutoImportLabeledIssues] = useState(true);
  const [effectiveImportLabelName, setEffectiveImportLabelName] = useState('Story');
  const [projectOptions, setProjectOptions] = useState<Array<{ id: string; name: string; teamIds: string[] }>>([]);
  const [stateOptions, setStateOptions] = useState<
    Array<{ id: string; name: string; type: string | null; teamId: string }>
  >([]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const data = await fetchJson<StoryMapLinearSettingsResponse>(
        `/api/story-maps/${storyMapId}/integrations/linear`,
        undefined,
        'Failed to load story map Linear settings',
      );

      setTeamId(data.team_id);
      setCanEdit(data.can_edit);
      setTeamLinearTeamId(data.team_settings.linear_team_id);
      setProjectId(asInputValue(data.story_map_settings.linear_project_id));
      setStateId(asInputValue(data.story_map_settings.linear_state_id));
      setAutoImportLabeledIssues(data.story_map_settings.auto_import_labeled_issues);
      setImportLabelName(data.story_map_settings.import_label_name);
      setEffectiveProjectId(data.effective_settings.linear_project_id ?? null);
      setEffectiveStateId(data.effective_settings.linear_state_id ?? null);
      setEffectiveAutoImportLabeledIssues(data.effective_settings.auto_import_labeled_issues);
      setEffectiveImportLabelName(data.effective_settings.import_label_name);

      if (!data.team_settings.linear_team_id) {
        setProjectOptions([]);
        setStateOptions([]);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storyMapId]);

  useEffect(() => {
    if (!open) return;
    loadSettings();
  }, [open, loadSettings]);

  useEffect(() => {
    if (!open || !teamId || !canEdit || !teamLinearTeamId) return;

    let cancelled = false;

    async function loadOptions() {
      setOptionsLoading(true);
      try {
        const data = await fetchJson<LinearOptionsResponse>(
          `/api/teams/${teamId}/integrations/linear/options`,
          undefined,
          'Failed to load Linear options',
        );

        if (cancelled) return;
        setProjectOptions(data.options.projects ?? []);
        setStateOptions(data.options.states ?? []);
      } catch {
        if (cancelled) return;
        setProjectOptions([]);
        setStateOptions([]);
      } finally {
        if (!cancelled) setOptionsLoading(false);
      }
    }

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, [open, teamId, canEdit, teamLinearTeamId]);

  const filteredProjectOptions = useMemo(
    () => projectOptions.filter((project) => (teamLinearTeamId ? project.teamIds.includes(teamLinearTeamId) : true)),
    [projectOptions, teamLinearTeamId],
  );

  const filteredStateOptions = useMemo(
    () => stateOptions.filter((state) => (teamLinearTeamId ? state.teamId === teamLinearTeamId : true)),
    [stateOptions, teamLinearTeamId],
  );

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      await fetchJson(
        `/api/story-maps/${storyMapId}/integrations/linear`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linear_project_id: asNullable(projectId),
            linear_state_id: asNullable(stateId),
            auto_import_labeled_issues: autoImportLabeledIssues,
            import_label_name: importLabelName.trim(),
          }),
        },
        'Failed to save story map Linear settings',
      );

      setNotice('Story map settings saved');
      await loadSettings();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleManualSync() {
    setSyncing(true);
    setError(null);
    setNotice(null);

    try {
      const result = await fetchJson<{ considered: number; succeeded: number; failed: number }>(
        `/api/story-maps/${storyMapId}/integrations/linear/sync`,
        { method: 'POST' },
        'Failed to sync story map with Linear',
      );

      if (result.failed > 0) {
        setError(
          `Manual sync completed with ${result.failed} failures (${result.succeeded}/${result.considered} succeeded).`,
        );
      } else {
        setNotice(`Manual sync complete: ${result.succeeded}/${result.considered} stories synced.`);
      }
      onSyncComplete?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  async function handleDeleteStoryMap() {
    if (!onDeleteStoryMap) return;
    setDeletingStoryMap(true);
    setError(null);
    setNotice(null);

    try {
      await onDeleteStoryMap();
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeletingStoryMap(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{storyMapName} Settings</DialogTitle>
          <DialogDescription>
            Configure story map-level Linear defaults with team settings as fallback.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            {!teamLinearTeamId && (
              <p className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Configure a Linear team in Team Settings before setting map defaults.
              </p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            {notice && <p className="text-sm text-emerald-700">{notice}</p>}

            <div className="space-y-2">
              <Label>Linear project (required for sync)</Label>
              <Select
                value={projectId || NO_SELECTION}
                onValueChange={(value) => setProjectId(value === NO_SELECTION ? '' : value)}
                disabled={
                  !canEdit || !teamLinearTeamId || saving || optionsLoading || filteredProjectOptions.length === 0
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SELECTION}>No project selected</SelectItem>
                  {filteredProjectOptions.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {teamLinearTeamId && filteredProjectOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">No Linear projects available for the selected team.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Default Linear state (optional)</Label>
              {filteredStateOptions.length > 0 ? (
                <Select
                  value={stateId || NO_SELECTION}
                  onValueChange={(value) => setStateId(value === NO_SELECTION ? '' : value)}
                  disabled={!canEdit || !teamLinearTeamId || saving || optionsLoading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="No default state" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SELECTION}>No default state</SelectItem>
                    {filteredStateOptions.map((state) => (
                      <SelectItem key={state.id} value={state.id}>
                        {state.name}
                        {state.type ? ` (${state.type})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={stateId}
                  onChange={(event) => setStateId(event.target.value)}
                  placeholder="Optional Linear state ID"
                  disabled={!canEdit || !teamLinearTeamId || saving}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="auto-import-labeled-issues">Auto-import labeled issues</Label>
              <label className="flex items-center gap-2 text-sm" htmlFor="auto-import-labeled-issues">
                <input
                  id="auto-import-labeled-issues"
                  type="checkbox"
                  checked={autoImportLabeledIssues}
                  onChange={(event) => setAutoImportLabeledIssues(event.target.checked)}
                  disabled={!canEdit || !teamLinearTeamId || saving}
                />
                Import unlinked Linear issues into Untriaged when they include the sync label.
              </label>
              {!asNullable(projectId) && (
                <p className="text-xs text-muted-foreground">
                  Select a Linear project above to enable story sync and labeled issue imports for this map.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="import-label-name">Sync label</Label>
              <Input
                id="import-label-name"
                value={importLabelName}
                onChange={(event) => setImportLabelName(event.target.value)}
                placeholder="Story"
                disabled={!canEdit || !teamLinearTeamId || saving}
              />
            </div>

            <div className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Effective project: {effectiveProjectId ?? 'none'} | Effective state: {effectiveStateId ?? 'none'} |
              Auto-import: {effectiveAutoImportLabeledIssues ? 'on' : 'off'} | Sync label: {effectiveImportLabelName}
            </div>

            <div className="space-y-2 rounded-md border bg-muted/20 p-3">
              <Label>Manual sync</Label>
              <p className="text-xs text-muted-foreground">
                Run a one-time reconciliation sync for all stories in this map.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={handleManualSync}
                disabled={!canEdit || !teamLinearTeamId || !asNullable(projectId) || syncing}
              >
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Run manual sync'}
              </Button>
            </div>

            {canEdit && onDeleteStoryMap && (
              <DangerZone description="Deleting this story map permanently removes all activities, tasks, stories, releases, and personas in it.">
                <DeleteButton
                  onDelete={handleDeleteStoryMap}
                  loading={deletingStoryMap}
                  label="Delete story map"
                  confirmTitle="Delete story map"
                  confirmDescription="This action cannot be undone. All map content will be permanently deleted."
                  confirmText={storyMapName}
                />
              </DangerZone>
            )}

            {canEdit ? (
              <Button type="submit" disabled={!teamLinearTeamId || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save settings'}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">Only team owners can update story map settings.</p>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
