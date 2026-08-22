'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IntegrationSection } from '@/components/ui/integration-section';
import { Label } from '@/components/ui/label';
import { nonCredentialFieldProps, nonCredentialFormProps } from '@/components/ui/non-credential-fields';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { StoryStatus } from '@/domain/story-map';

type StatusMapping = Partial<Record<StoryStatus, string>>;

function asNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function StoryMapLinearSettings({
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
  statusMapping: StatusMapping;
  onStatusMappingChange: (key: StoryStatus, value: string | null) => void;
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
        <form {...nonCredentialFormProps} onSubmit={onSave} className="space-y-4">
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
                  {...nonCredentialFieldProps}
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
