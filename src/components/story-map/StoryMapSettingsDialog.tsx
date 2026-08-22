'use client';

import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StoryMapLinearSettings } from '@/components/integrations/linear/StoryMapLinearSettings';
import { Button } from '@/components/ui/button';
import { DangerZone } from '@/components/ui/danger-zone';
import { DeleteButton } from '@/components/ui/delete-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { nonCredentialFieldProps, nonCredentialFormProps } from '@/components/ui/non-credential-fields';
import { SettingsDialog } from '@/components/ui/settings-dialog';
import { Textarea } from '@/components/ui/textarea';
import type { StoryStatus } from '@/domain/story-map';
import { manualLinearSyncResponseSchema, storyMapLinearSettingsResponseSchema } from '@/integrations/linear/adapter';
import { errorMessage } from '@/lib/errors';
import { fetchJson } from '@/lib/http';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StoryMapSettingsTab = 'general' | 'integrations' | 'danger';
type StatusMapping = Partial<Record<StoryStatus, string>>;

interface LinearSettingsDraft {
  projectId: string;
  useTeamStatusMapping: boolean;
  statusMapping: StatusMapping;
  autoImportLabeledIssues: boolean;
  importLabelName: string;
}

const EMPTY_LINEAR_SETTINGS: LinearSettingsDraft = {
  projectId: '',
  useTeamStatusMapping: true,
  statusMapping: {},
  autoImportLabeledIssues: true,
  importLabelName: 'Story',
};

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
    <form {...nonCredentialFormProps} onSubmit={onSave} className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-success">{notice}</p>}

      <div className="space-y-2">
        <Label htmlFor="story-map-name">Name</Label>
        <Input
          id="story-map-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          disabled={saving}
          {...nonCredentialFieldProps}
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
          {...nonCredentialFieldProps}
        />
      </div>

      <Button type="submit" disabled={saving || !name.trim() || !hasChanges}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
      </Button>
    </form>
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
  const [integrationDraft, setIntegrationDraft] = useState<LinearSettingsDraft>(EMPTY_LINEAR_SETTINGS);
  const [savedIntegrationDraft, setSavedIntegrationDraft] = useState<LinearSettingsDraft>(EMPTY_LINEAR_SETTINGS);
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
      const data = storyMapLinearSettingsResponseSchema.parse(
        await fetchJson<unknown>(
          `/api/story-maps/${storyMapId}/integrations/linear`,
          undefined,
          'Failed to load story map Linear settings',
        ),
      );

      setTeamId(data.team_id);
      setCanEdit(data.can_edit);
      setTeamLinearConnected(data.team_settings.linear_connected);
      setTeamLinearTeamId(data.team_settings.linear_team_id);
      const nextDraft: LinearSettingsDraft = {
        projectId: asInputValue(data.story_map_settings.linear_project_id),
        useTeamStatusMapping: data.story_map_settings.use_team_status_mapping,
        statusMapping: data.story_map_settings.linear_status_mapping ?? {},
        autoImportLabeledIssues: data.story_map_settings.auto_import_labeled_issues,
        importLabelName: data.story_map_settings.import_label_name,
      };
      setIntegrationDraft(nextDraft);
      setSavedIntegrationDraft(nextDraft);
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
  const { projectId, useTeamStatusMapping, statusMapping, autoImportLabeledIssues, importLabelName } = integrationDraft;

  const hasGeneralChanges = editName !== storyMapName || asNullable(editDescription) !== (storyMapDescription ?? null);

  const hasIntegrationsChanges =
    asNullable(projectId) !== asNullable(savedIntegrationDraft.projectId) ||
    useTeamStatusMapping !== savedIntegrationDraft.useTeamStatusMapping ||
    JSON.stringify(statusMapping) !== JSON.stringify(savedIntegrationDraft.statusMapping) ||
    autoImportLabeledIssues !== savedIntegrationDraft.autoImportLabeledIssues ||
    importLabelName.trim() !== savedIntegrationDraft.importLabelName.trim();

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
      const result = manualLinearSyncResponseSchema.parse(
        await fetchJson<unknown>(
          `/api/story-maps/${storyMapId}/integrations/linear/sync`,
          { method: 'POST' },
          'Failed to sync story map with Linear',
        ),
      );

      const storySummary = [
        `${result.stories.created_in_linear} new Linear issues created`,
        `${result.stories.synced_to_linear} existing Linear issues updated`,
        `${result.stories.synced_from_linear} linked stories updated from Linear`,
      ].join('; ');
      const importSummary = `Of ${result.imports.considered} Linear issues checked, ${result.imports.imported} were imported, ${result.imports.skipped_already_linked} were already linked, and ${result.imports.skipped_no_candidate} did not match this story map`;

      const ignoredSummary = result.stories.ignored > 0 ? `; ${result.stories.ignored} stories were skipped` : '';

      if (result.stories.failed > 0) {
        setIntegrationsError(
          `Manual sync completed with ${result.stories.failed} failures (${storySummary}${ignoredSummary}; ${importSummary}).`,
        );
      } else {
        setIntegrationsNotice(`Manual sync complete: ${storySummary}${ignoredSummary}; ${importSummary}.`);
      }
      onSyncComplete?.();
    } catch (err) {
      setIntegrationsError(errorMessage(err));
    } finally {
      setSyncing(false);
    }
  }

  function updateIntegrationDraft(changes: Partial<LinearSettingsDraft>) {
    setIntegrationDraft((current) => ({ ...current, ...changes }));
  }

  function handleStatusMappingChange(key: StoryStatus, value: string | null) {
    setIntegrationDraft((current) => {
      const next = { ...current.statusMapping };
      if (value === null) delete next[key];
      else next[key] = value;
      return { ...current, statusMapping: next };
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
        <StoryMapLinearSettings
          canEdit={canEdit}
          teamLinearAvailable={teamLinearAvailable}
          filteredProjectOptions={filteredProjectOptions}
          filteredStateOptions={filteredStateOptions}
          optionsLoading={optionsLoading}
          projectId={projectId}
          onProjectIdChange={(value) => updateIntegrationDraft({ projectId: value })}
          useTeamStatusMapping={useTeamStatusMapping}
          onUseTeamStatusMappingChange={(value) => updateIntegrationDraft({ useTeamStatusMapping: value })}
          statusMapping={statusMapping}
          onStatusMappingChange={handleStatusMappingChange}
          autoImportLabeledIssues={autoImportLabeledIssues}
          onAutoImportLabeledIssuesChange={(value) => updateIntegrationDraft({ autoImportLabeledIssues: value })}
          importLabelName={importLabelName}
          onImportLabelNameChange={(value) => updateIntegrationDraft({ importLabelName: value })}
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
