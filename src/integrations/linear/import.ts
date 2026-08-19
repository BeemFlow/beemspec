import { buildStoryPatchFromLinearIssue } from '@beemspec/linear';
import { emptyContent } from '@beemspec/storymap';
import { buildDbUpdateFromPatch, type StoryStatus } from '@beemspec/sync';
import { toStoryMapLinearImportSettings } from '@/integrations/linear/settings';
import { normalize } from '@/lib/strings';
import type { Supabase, SupabaseLike } from '@/lib/supabase/types';

interface StoryMapRow {
  id: string;
  team_id: string;
  created_at: string;
}

interface StoryMapSettingsRow {
  story_map_id: string;
  linear_project_id: string | null;
  auto_import_labeled_issues: boolean | null;
  import_label_name: string | null;
}

interface StoryMapIntegrationSettingsTable {
  select(columns: string): {
    in(column: string, values: string[]): Promise<{ data: StoryMapSettingsRow[] | null; error: unknown }>;
  };
}

interface IntegrationSettingsRow {
  team_id: string;
}

interface IntegrationSettingsTable {
  select(columns: string): {
    eq(column: string, value: string): Promise<{ data: IntegrationSettingsRow[] | null; error: unknown }>;
  };
}

interface StoryMapsTable {
  select(columns: string): {
    eq(column: string, value: string): Promise<{ data: StoryMapRow[] | null; error: unknown }>;
    in(column: string, values: string[]): Promise<{ data: StoryMapRow[] | null; error: unknown }>;
  };
}

function sameName(a: string | null | undefined, b: string): boolean {
  const left = normalize(a);
  return Boolean(left && left.toLowerCase() === b.toLowerCase());
}

interface StoryMapImportCandidate {
  storyMapId: string;
}

export async function findStoryMapImportCandidate(
  supabase: SupabaseLike,
  input: { teamId: string; linearProjectId: string | null; labelNames: string[] },
): Promise<StoryMapImportCandidate | null> {
  const integrationSettingsTable = supabase.from('integration_settings') as IntegrationSettingsTable;
  const { data: teamMappings, error: teamMappingsError } = await integrationSettingsTable
    .select('team_id')
    .eq('linear_team_id', input.teamId);
  if (teamMappingsError) throw teamMappingsError;

  const beemTeamIds = [...new Set((teamMappings ?? []).map((row) => row.team_id).filter(Boolean))];
  if (beemTeamIds.length === 0) return null;

  const storyMapsTable = supabase.from('story_maps') as StoryMapsTable;
  const { data: maps, error: mapError } = await storyMapsTable
    .select('id, team_id, created_at')
    .in('team_id', beemTeamIds);
  if (mapError) throw mapError;

  const mapRows = (maps ?? []) as StoryMapRow[];
  if (mapRows.length === 0) return null;

  if (!input.linearProjectId) return null;

  const mapIds = mapRows.map((row) => row.id);
  const storyMapSettingsTable = supabase.from('story_map_integration_settings') as StoryMapIntegrationSettingsTable;
  const { data: mapSettings, error: mapSettingsError } = await storyMapSettingsTable
    .select('story_map_id, linear_project_id, auto_import_labeled_issues, import_label_name')
    .in('story_map_id', mapIds);
  if (mapSettingsError) throw mapSettingsError;

  const mapSettingsById = new Map<string, StoryMapSettingsRow>();
  for (const row of (mapSettings ?? []) as StoryMapSettingsRow[]) {
    mapSettingsById.set(row.story_map_id, row);
  }

  const candidates: StoryMapImportCandidate[] = mapRows
    .map((row) => {
      const rowSettings = mapSettingsById.get(row.id) ?? null;
      const importSettings = toStoryMapLinearImportSettings(rowSettings);
      const projectOverride = normalize(rowSettings?.linear_project_id);
      if (!importSettings.autoImportLabeledIssues) return null;
      if (!projectOverride) return null;
      if (projectOverride !== input.linearProjectId) return null;
      if (!input.labelNames.some((labelName) => sameName(importSettings.importLabelName, labelName))) return null;

      return {
        storyMapId: row.id,
      };
    })
    .filter((candidate): candidate is StoryMapImportCandidate => candidate !== null);

  if (candidates.length === 0) return null;
  if (candidates.length > 1) return null;
  return candidates[0] ?? null;
}

export async function importLinearIssueIntoStoryMap(input: {
  supabase: Supabase;
  storyMapId: string;
  linearIssueId: string;
  linearIssueIdentifier: string | null;
  title: string | null;
  description: string | null;
  stateName: string | null;
  updatedAt: string;
  receipt?: {
    idempotencyKey: string;
    type: string;
    action: string;
    payload: unknown;
  };
}): Promise<{ storyId: string; duplicate: boolean }> {
  const patch = buildStoryPatchFromLinearIssue({
    title: input.title,
    description: input.description,
    stateName: input.stateName,
    updatedAt: input.updatedAt,
  });

  const dbUpdate = buildDbUpdateFromPatch(patch, null);
  const title = normalize(patch.title) ?? normalize(input.title) ?? input.linearIssueIdentifier ?? input.linearIssueId;
  const status = (patch.status ?? 'backlog') as StoryStatus;
  const content = (dbUpdate.content as Record<string, unknown> | null) ?? emptyContent();

  const { data, error } = await input.supabase
    .rpc('import_linear_issue_into_story_map', {
      p_story_map_id: input.storyMapId,
      p_linear_issue_id: input.linearIssueId,
      p_linear_issue_identifier: input.linearIssueIdentifier,
      p_story_title: title,
      p_story_status: status,
      p_story_content: content,
      p_story_updated_at: input.updatedAt,
      p_idempotency_key: input.receipt?.idempotencyKey ?? null,
      p_event_type: input.receipt?.type ?? null,
      p_event_action: input.receipt?.action ?? null,
      p_payload: input.receipt?.payload ?? null,
    })
    .single<{ duplicate: boolean; story_id: string | null }>();

  if (error || !data?.story_id) {
    throw error ?? new Error('Failed to import Linear issue into story map');
  }

  return { storyId: data.story_id, duplicate: data.duplicate };
}
