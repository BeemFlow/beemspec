'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DangerZone } from '@/components/ui/DangerZone';
import { DeleteButton } from '@/components/ui/DeleteButton';
import { Input } from '@/components/ui/Input';
import { IntegrationSection } from '@/components/ui/IntegrationSection';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { SettingsDialog } from '@/components/ui/SettingsDialog';
import { Textarea } from '@/components/ui/Textarea';
import { errorMessage } from '@/lib/errors';
import { fetchJson } from '@/lib/http';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StoryMapSettingsTab = 'general' | 'integrations' | 'danger';

interface StoryMapLinearSettingsResponse {
  story_map_id: string;
  team_id: string;
  can_edit: boolean;
  team_settings: {
    linear_connected: boolean;
    linear_team_id: string | null;
    linear_status_mapping: Partial<Record<'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done', string>>;
  };
  story_map_settings: {
    linear_project_id: string | null;
    use_team_status_mapping: boolean;
    linear_status_mapping: Partial<Record<'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done', string>>;
    auto_import_labeled_issues: boolean;
    import_label_name: string;
    updated_at: string | null;
  };
  effective_settings: {
    linear_project_id: string | null;
    linear_status_mapping: Partial<Record<'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done', string>>;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asInputValue(value: string | null | undefined): string {
  return value ?? '';
}

function asNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ---------------------------------------------------------------------------
// Tab components
// ---------------------------------------------------------------------------

function GeneralTab({
  name,
  description,
  saving,
  hasChanges,
  onNameChange,
  onDescriptionChange,
  onSave,
  notice,
  error,
}: {
  name: string;
  description: string;
  saving: boolean;
  hasChanges: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSave: (event: React.FormEvent) => void;
  notice: string | null;
  error: string | null;
}) {
  return (
    <form onSubmit={onSave} className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-success">{notice}</p>}

      <div className="space-y-2">
        <Label htmlFor="story-map-name">Name</Label>
        <Input
          id="story-map-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          disabled={saving}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="story-map-description">Description</Label>
        <Textarea
          id="story-map-description"
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Optional description"
          disabled={saving}
        />
      </div>

      <Button type="submit" disabled={saving || !name.trim() || !hasChanges}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
      </Button>
    </form>
  );
}

function IntegrationsTab({
  canEdit,
  teamLinearAvailable,
  filteredProjectOptions,
  filteredStateOptions,
  optionsLoading,
  projectId,
  onProjectIdChange,
  useTeamStatusMapping,
  onUseTeamStatusMappingChange,
  statusMapping,
  onStatusMappingChange,
  autoImportLabeledIssues,
  onAutoImportLabeledIssuesChange,
  importLabelName,
  onImportLabelNameChange,
  saving,
  syncing,
  hasUnsavedChanges,
  effectiveProjectId,
  onSave,
  onManualSync,
  notice,
  error,
}: {
  canEdit: boolean;
  teamLinearAvailable: boolean;
  filteredProjectOptions: Array<{ id: string; name: string; teamIds: string[] }>;
  filteredStateOptions: Array<{ id: string; name: string; type: string | null; teamId: string }>;
  optionsLoading: boolean;
  projectId: string;
  onProjectIdChange: (value: string) => void;
  useTeamStatusMapping: boolean;
  onUseTeamStatusMappingChange: (value: boolean) => void;
  statusMapping: Partial<Record<'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done', string>>;
  onStatusMappingChange: (key: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done', value: string | null) => void;
  autoImportLabeledIssues: boolean;
  onAutoImportLabeledIssuesChange: (value: boolean) => void;
  importLabelName: string;
  onImportLabelNameChange: (value: string) => void;
  saving: boolean;
  syncing: boolean;
  hasUnsavedChanges: boolean;
  effectiveProjectId: string | null;
  onSave: (event: React.FormEvent) => void;
  onManualSync: () => void;
  notice: string | null;
  error: string | null;
}) {
  const NO_SELECTION = '__none__';
  const manualSyncDisabled =
    !canEdit || !teamLinearAvailable || syncing || saving || hasUnsavedChanges || !effectiveProjectId;

  return (
    <div className="space-y-6">
      <IntegrationSection title="Linear" description="Configure Linear sync behavior for this story map.">
        <form onSubmit={onSave} className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {notice && <p className="text-sm text-success">{notice}</p>}

          {!teamLinearAvailable ? (
            <p className="rounded-md border border-border-accent bg-warning px-3 py-2 text-sm text-warning-foreground">
              Connect Linear in Team Settings before configuring map-level project mapping, status overrides, and sync
              behavior.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Linear project (required for sync)</Label>
                <Select
                  value={projectId || NO_SELECTION}
                  onValueChange={(value) => onProjectIdChange(value === NO_SELECTION ? '' : value)}
                  disabled={!canEdit || saving || optionsLoading || filteredProjectOptions.length === 0}
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
                {filteredProjectOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">No Linear projects available for the selected team.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Status mapping</Label>
                <p className="text-xs text-muted-foreground">
                  Use team defaults by default. Turn this off to override status mapping for this map.
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useTeamStatusMapping}
                    onChange={(event) => onUseTeamStatusMappingChange(event.target.checked)}
                    disabled={!canEdit || saving}
                  />
                  Use team status mapping
                </label>

                {!useTeamStatusMapping && (
                  <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                    {(
                      [
                        ['backlog', 'Backlog'],
                        ['todo', 'Todo'],
                        ['in_progress', 'In Progress'],
                        ['in_review', 'In Review'],
                        ['done', 'Done'],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="grid grid-cols-[120px_1fr] items-center gap-2">
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <Select
                          value={statusMapping[key] || NO_SELECTION}
                          onValueChange={(value) => onStatusMappingChange(key, value === NO_SELECTION ? null : value)}
                          disabled={!canEdit || saving || optionsLoading}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={`Map ${label}`} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_SELECTION}>Unmapped</SelectItem>
                            {filteredStateOptions.map((state) => (
                              <SelectItem key={state.id} value={state.id}>
                                {state.name}
                                {state.type ? ` (${state.type})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="auto-import-labeled-issues">Auto-import labeled issues</Label>
                <label className="flex items-center gap-2 text-sm" htmlFor="auto-import-labeled-issues">
                  <input
                    id="auto-import-labeled-issues"
                    type="checkbox"
                    checked={autoImportLabeledIssues}
                    onChange={(event) => onAutoImportLabeledIssuesChange(event.target.checked)}
                    disabled={!canEdit || saving}
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
                  onChange={(event) => onImportLabelNameChange(event.target.value)}
                  placeholder="Story"
                  disabled={!canEdit || saving}
                />
              </div>

              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <Label>Manual sync</Label>
                <p className="text-xs text-muted-foreground">
                  Run a one-time reconciliation sync for all stories in this map.
                </p>
                {hasUnsavedChanges && (
                  <p className="text-xs text-warning-foreground">Save before running manual sync.</p>
                )}
                {!effectiveProjectId && !hasUnsavedChanges && (
                  <p className="text-xs text-muted-foreground">Choose and save a Linear project to enable sync.</p>
                )}
                <Button type="button" variant="outline" onClick={onManualSync} disabled={manualSyncDisabled}>
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Run manual sync
                </Button>
              </div>

              {canEdit ? (
                <Button type="submit" disabled={saving || !hasUnsavedChanges}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Only team owners can update story map settings.</p>
              )}
            </>
          )}
        </form>
      </IntegrationSection>
    </div>
  );
}

function DangerTab({
  storyMapName,
  loading,
  canEdit,
  deleting,
  onDelete,
}: {
  storyMapName: string;
  loading: boolean;
  canEdit: boolean;
  deleting: boolean;
  onDelete: () => Promise<void>;
}) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Checking permissions...</p>;
  }

  if (!canEdit) {
    return <p className="text-sm text-muted-foreground">Only team owners can delete a story map.</p>;
  }

  return (
    <DangerZone description="Deleting this story map permanently removes all activities, tasks, stories, releases, and personas in it.">
      <DeleteButton
        onDelete={onDelete}
        loading={deleting}
        label="Delete story map"
        confirmTitle="Delete story map"
        confirmDescription="This action cannot be undone. All map content will be permanently deleted."
        confirmText={storyMapName}
      />
    </DangerZone>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StoryMapSettingsDialog({
  open,
  onOpenChange,
  storyMapId,
  storyMapName,
  storyMapDescription,
  onStoryMapUpdated,
  onSyncComplete,
  onDeleteStoryMap,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storyMapId: string;
  storyMapName: string;
  storyMapDescription: string | null | undefined;
  onStoryMapUpdated?: () => void;
  onSyncComplete?: () => void;
  onDeleteStoryMap?: () => Promise<void>;
}) {
  // Tab state
  const [activeTab, setActiveTab] = useState<StoryMapSettingsTab>('general');

  // General tab state
  const [editName, setEditName] = useState(storyMapName);
  const [editDescription, setEditDescription] = useState(asInputValue(storyMapDescription));
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [generalNotice, setGeneralNotice] = useState<string | null>(null);

  // Integrations tab state
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [integrationsError, setIntegrationsError] = useState<string | null>(null);
  const [integrationsNotice, setIntegrationsNotice] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamLinearConnected, setTeamLinearConnected] = useState(false);
  const [teamLinearTeamId, setTeamLinearTeamId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [useTeamStatusMapping, setUseTeamStatusMapping] = useState(true);
  const [statusMapping, setStatusMapping] = useState<
    Partial<Record<'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done', string>>
  >({});
  const [autoImportLabeledIssues, setAutoImportLabeledIssues] = useState(true);
  const [importLabelName, setImportLabelName] = useState('Story');
  const [savedProjectId, setSavedProjectId] = useState('');
  const [savedAutoImportLabeledIssues, setSavedAutoImportLabeledIssues] = useState(true);
  const [savedImportLabelName, setSavedImportLabelName] = useState('Story');
  const [savedUseTeamStatusMapping, setSavedUseTeamStatusMapping] = useState(true);
  const [savedStatusMapping, setSavedStatusMapping] = useState<
    Partial<Record<'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done', string>>
  >({});
  const [effectiveProjectId, setEffectiveProjectId] = useState<string | null>(null);
  const [projectOptions, setProjectOptions] = useState<Array<{ id: string; name: string; teamIds: string[] }>>([]);
  const [stateOptions, setStateOptions] = useState<
    Array<{ id: string; name: string; type: string | null; teamId: string }>
  >([]);

  // Danger tab state
  const [deletingStoryMap, setDeletingStoryMap] = useState(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setIntegrationsError(null);
    setIntegrationsNotice(null);

    try {
      const data = await fetchJson<StoryMapLinearSettingsResponse>(
        `/api/story-maps/${storyMapId}/integrations/linear`,
        undefined,
        'Failed to load story map Linear settings',
      );

      setTeamId(data.team_id);
      setCanEdit(data.can_edit);
      setTeamLinearConnected(data.team_settings.linear_connected);
      setTeamLinearTeamId(data.team_settings.linear_team_id);
      const nextProjectId = asInputValue(data.story_map_settings.linear_project_id);
      setProjectId(nextProjectId);
      setSavedProjectId(nextProjectId);
      setUseTeamStatusMapping(data.story_map_settings.use_team_status_mapping);
      setSavedUseTeamStatusMapping(data.story_map_settings.use_team_status_mapping);
      setStatusMapping(data.story_map_settings.linear_status_mapping ?? {});
      setSavedStatusMapping(data.story_map_settings.linear_status_mapping ?? {});
      setAutoImportLabeledIssues(data.story_map_settings.auto_import_labeled_issues);
      setSavedAutoImportLabeledIssues(data.story_map_settings.auto_import_labeled_issues);
      setImportLabelName(data.story_map_settings.import_label_name);
      setSavedImportLabelName(data.story_map_settings.import_label_name);
      setEffectiveProjectId(data.effective_settings.linear_project_id ?? null);
      if (!data.team_settings.linear_connected || !data.team_settings.linear_team_id) {
        setProjectOptions([]);
        setStateOptions([]);
      }
    } catch (err) {
      setIntegrationsError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [storyMapId]);

  useEffect(() => {
    if (!open) return;
    setActiveTab('general');
    setEditName(storyMapName);
    setEditDescription(asInputValue(storyMapDescription));
    setGeneralError(null);
    setGeneralNotice(null);
    setIntegrationsError(null);
    setIntegrationsNotice(null);
    loadSettings();
  }, [open, storyMapName, storyMapDescription, loadSettings]);

  useEffect(() => {
    if (!open || !teamId || !canEdit || !teamLinearConnected || !teamLinearTeamId) return;

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
  }, [open, teamId, canEdit, teamLinearConnected, teamLinearTeamId]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const filteredProjectOptions = useMemo(
    () => projectOptions.filter((project) => (teamLinearTeamId ? project.teamIds.includes(teamLinearTeamId) : true)),
    [projectOptions, teamLinearTeamId],
  );

  const filteredStateOptions = useMemo(
    () => stateOptions.filter((state) => (teamLinearTeamId ? state.teamId === teamLinearTeamId : true)),
    [stateOptions, teamLinearTeamId],
  );

  const teamLinearAvailable = teamLinearConnected && Boolean(teamLinearTeamId);

  const hasGeneralChanges = editName !== storyMapName || asNullable(editDescription) !== (storyMapDescription ?? null);

  const hasIntegrationsChanges =
    asNullable(projectId) !== asNullable(savedProjectId) ||
    useTeamStatusMapping !== savedUseTeamStatusMapping ||
    JSON.stringify(statusMapping) !== JSON.stringify(savedStatusMapping) ||
    autoImportLabeledIssues !== savedAutoImportLabeledIssues ||
    importLabelName.trim() !== savedImportLabelName.trim();

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleSaveGeneral(event: React.FormEvent) {
    event.preventDefault();
    setSavingGeneral(true);
    setGeneralError(null);
    setGeneralNotice(null);

    try {
      const body: Record<string, string | null> = {};
      if (editName !== storyMapName) body.name = editName;
      const nextDescription = asNullable(editDescription);
      if (nextDescription !== (storyMapDescription ?? null)) body.description = nextDescription;

      await fetchJson(
        `/api/story-maps/${storyMapId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        'Failed to update story map',
      );

      setGeneralNotice('Story map updated');
      onStoryMapUpdated?.();
    } catch (err) {
      setGeneralError(errorMessage(err));
    } finally {
      setSavingGeneral(false);
    }
  }

  async function handleSaveIntegrations(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setIntegrationsError(null);
    setIntegrationsNotice(null);

    try {
      await fetchJson(
        `/api/story-maps/${storyMapId}/integrations/linear`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linear_project_id: asNullable(projectId),
            use_team_status_mapping: useTeamStatusMapping,
            linear_status_mapping: statusMapping,
            auto_import_labeled_issues: autoImportLabeledIssues,
            import_label_name: importLabelName.trim(),
          }),
        },
        'Failed to save story map Linear settings',
      );

      setIntegrationsNotice('Story map settings saved');
      await loadSettings();
    } catch (err) {
      setIntegrationsError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleManualSync() {
    setSyncing(true);
    setIntegrationsError(null);
    setIntegrationsNotice(null);

    try {
      const result = await fetchJson<{
        considered: number;
        succeeded: number;
        failed: number;
        import_considered: number;
        imported: number;
        import_skipped: number;
      }>(
        `/api/story-maps/${storyMapId}/integrations/linear/sync`,
        { method: 'POST' },
        'Failed to sync story map with Linear',
      );

      const existingSyncSummary = `${result.succeeded}/${result.considered} existing stories synced`;
      const importSummary = `${result.imported}/${result.import_considered} labeled issues imported`;

      if (result.failed > 0) {
        setIntegrationsError(
          `Manual sync completed with ${result.failed} failures (${existingSyncSummary}; ${importSummary}).`,
        );
      } else {
        setIntegrationsNotice(
          `Manual sync complete: ${existingSyncSummary}; ${importSummary} (${result.import_skipped} skipped).`,
        );
      }
      onSyncComplete?.();
    } catch (err) {
      setIntegrationsError(errorMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  function handleStatusMappingChange(
    key: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done',
    value: string | null,
  ) {
    setStatusMapping((current) => {
      const next = { ...current };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  async function handleDeleteStoryMap() {
    if (!onDeleteStoryMap) return;
    setDeletingStoryMap(true);

    try {
      await onDeleteStoryMap();
      onOpenChange(false);
    } catch (err) {
      setGeneralError(errorMessage(err));
    } finally {
      setDeletingStoryMap(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------------

  const tabs = [
    {
      value: 'general',
      label: 'General',
      content: (
        <GeneralTab
          name={editName}
          description={editDescription}
          saving={savingGeneral}
          hasChanges={hasGeneralChanges}
          onNameChange={setEditName}
          onDescriptionChange={setEditDescription}
          onSave={handleSaveGeneral}
          notice={generalNotice}
          error={generalError}
        />
      ),
    },
    {
      value: 'integrations',
      label: 'Integrations',
      content: loading ? (
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      ) : (
        <IntegrationsTab
          canEdit={canEdit}
          teamLinearAvailable={teamLinearAvailable}
          filteredProjectOptions={filteredProjectOptions}
          filteredStateOptions={filteredStateOptions}
          optionsLoading={optionsLoading}
          projectId={projectId}
          onProjectIdChange={setProjectId}
          useTeamStatusMapping={useTeamStatusMapping}
          onUseTeamStatusMappingChange={setUseTeamStatusMapping}
          statusMapping={statusMapping}
          onStatusMappingChange={handleStatusMappingChange}
          autoImportLabeledIssues={autoImportLabeledIssues}
          onAutoImportLabeledIssuesChange={setAutoImportLabeledIssues}
          importLabelName={importLabelName}
          onImportLabelNameChange={setImportLabelName}
          saving={saving}
          syncing={syncing}
          hasUnsavedChanges={hasIntegrationsChanges}
          effectiveProjectId={effectiveProjectId}
          onSave={handleSaveIntegrations}
          onManualSync={handleManualSync}
          notice={integrationsNotice}
          error={integrationsError}
        />
      ),
    },
    ...(onDeleteStoryMap
      ? [
          {
            value: 'danger',
            label: 'Danger',
            content: (
              <DangerTab
                storyMapName={storyMapName}
                loading={loading}
                canEdit={canEdit}
                deleting={deletingStoryMap}
                onDelete={handleDeleteStoryMap}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <SettingsDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Story Map Settings"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(value) => setActiveTab(value as StoryMapSettingsTab)}
    />
  );
}
