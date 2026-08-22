import type { StoryStatus } from '@beemspec/storymap';
import type { SyncTarget } from '@beemspec/sync';
import { normalize } from '@/lib/strings';
import type { SupabaseLike } from '@/lib/supabase/types';

const STORY_STATUSES: StoryStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];

interface LinearStatusMappingRaw {
  backlog?: string | null;
  todo?: string | null;
  in_progress?: string | null;
  in_review?: string | null;
  done?: string | null;
}

interface IntegrationSettingsRow {
  linear_team_id: string | null;
  linear_status_mapping?: LinearStatusMappingRaw | null;
}

interface StoryMapIntegrationSettingsRow {
  linear_project_id: string | null;
  use_team_status_mapping?: boolean | null;
  linear_status_mapping?: LinearStatusMappingRaw | null;
  auto_import_labeled_issues?: boolean | null;
  import_label_name?: string | null;
}

export interface StoryMapLinearImportSettings {
  autoImportLabeledIssues: boolean;
  importLabelName: string;
}

export const DEFAULT_LINEAR_IMPORT_LABEL = 'Story';
export const DEFAULT_AUTO_IMPORT_LABELED_ISSUES = true;

interface StoriesTable {
  select(columns: string): {
    eq(
      column: string,
      value: string,
    ): {
      single(): Promise<{
        data: { tasks: { activities: { story_maps: { id: string; team_id: string } | null } | null } | null } | null;
        error: unknown;
      }>;
    };
  };
}

interface StoryMapIntegrationSettingsTable {
  select(columns: string): {
    eq(
      column: string,
      value: string,
    ): {
      maybeSingle(): Promise<{ data: StoryMapIntegrationSettingsRow | null; error: unknown }>;
    };
  };
}

interface IntegrationSettingsTable {
  select(columns: string): {
    eq(
      column: string,
      value: string,
    ): {
      maybeSingle(): Promise<{ data: IntegrationSettingsRow | null; error: unknown }>;
    };
  };
}

interface StoryMapsTable {
  select(columns: string): {
    eq(
      column: string,
      value: string,
    ): {
      single(): Promise<{ data: { team_id: string } | null; error: unknown }>;
    };
  };
}

interface TeamIdResult {
  teamId: string | null;
}

function normalizeStatusMapping(
  input: LinearStatusMappingRaw | null | undefined,
): Partial<Record<StoryStatus, string>> | undefined {
  if (!input) return undefined;

  const normalized: Partial<Record<StoryStatus, string>> = {};
  for (const status of STORY_STATUSES) {
    const value = normalize(input[status]);
    if (value) normalized[status] = value;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function mergeStatusMappings(
  base: Partial<Record<StoryStatus, string>> | undefined,
  override: Partial<Record<StoryStatus, string>> | undefined,
): Partial<Record<StoryStatus, string>> | undefined {
  const merged: Partial<Record<StoryStatus, string>> = {};
  for (const status of STORY_STATUSES) {
    const value = override?.[status] ?? base?.[status];
    if (value) merged[status] = value;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function toLinearTarget(row: IntegrationSettingsRow | null): SyncTarget | null {
  if (!row) return null;

  const teamId = normalize(row.linear_team_id);
  if (!teamId) return null;

  return {
    teamId,
    statusMapping: normalizeStatusMapping(row.linear_status_mapping),
  };
}

function applyStoryMapOverrides(
  target: SyncTarget,
  overrides: StoryMapIntegrationSettingsRow | null,
): SyncTarget | null {
  const mapProjectId = normalize(overrides?.linear_project_id);
  if (!mapProjectId) return null;

  return {
    teamId: target.teamId,
    projectId: mapProjectId,
    statusMapping:
      overrides?.use_team_status_mapping === false
        ? mergeStatusMappings(undefined, normalizeStatusMapping(overrides.linear_status_mapping))
        : mergeStatusMappings(target.statusMapping, normalizeStatusMapping(overrides?.linear_status_mapping)),
  };
}

async function getStoryMapLinearOverrides(
  supabase: SupabaseLike,
  storyMapId: string,
): Promise<StoryMapIntegrationSettingsRow | null> {
  const table = supabase.from('story_map_integration_settings') as StoryMapIntegrationSettingsTable;
  const { data, error } = await table
    .select(
      'linear_project_id, use_team_status_mapping, linear_status_mapping, auto_import_labeled_issues, import_label_name',
    )
    .eq('story_map_id', storyMapId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function toStoryMapLinearImportSettings(
  row: StoryMapIntegrationSettingsRow | null | undefined,
): StoryMapLinearImportSettings {
  return {
    autoImportLabeledIssues:
      typeof row?.auto_import_labeled_issues === 'boolean'
        ? row.auto_import_labeled_issues
        : DEFAULT_AUTO_IMPORT_LABELED_ISSUES,
    importLabelName: normalize(row?.import_label_name) ?? DEFAULT_LINEAR_IMPORT_LABEL,
  };
}

export async function getStoryMapLinearImportSettings(
  supabase: SupabaseLike,
  storyMapId: string,
): Promise<StoryMapLinearImportSettings> {
  const row = await getStoryMapLinearOverrides(supabase, storyMapId);
  return toStoryMapLinearImportSettings(row);
}

async function getSettingsForTeamId(supabase: SupabaseLike, teamId: string): Promise<SyncTarget | null> {
  const table = supabase.from('integration_settings') as IntegrationSettingsTable;
  const { data, error } = await table
    .select('linear_team_id, linear_status_mapping')
    .eq('team_id', teamId)
    .maybeSingle();

  if (error) throw error;
  return toLinearTarget(data);
}

async function getTeamIdForStoryMapInternal(supabase: SupabaseLike, storyMapId: string): Promise<TeamIdResult> {
  const storyMapsTable = supabase.from('story_maps') as StoryMapsTable;
  const { data, error } = await storyMapsTable.select('team_id').eq('id', storyMapId).single();
  if (error) throw error;
  return { teamId: data?.team_id ?? null };
}

export async function getTeamIdForStoryMap(supabase: SupabaseLike, storyMapId: string): Promise<string | null> {
  const result = await getTeamIdForStoryMapInternal(supabase, storyMapId);
  return result.teamId;
}

export async function getSyncTargetForStoryMap(supabase: SupabaseLike, storyMapId: string): Promise<SyncTarget | null> {
  const result = await getTeamIdForStoryMapInternal(supabase, storyMapId);
  if (!result.teamId) return null;

  const [teamTarget, storyMapOverrides] = await Promise.all([
    getSettingsForTeamId(supabase, result.teamId),
    getStoryMapLinearOverrides(supabase, storyMapId),
  ]);

  if (!teamTarget) return null;
  return applyStoryMapOverrides(teamTarget, storyMapOverrides);
}

export async function getSyncTargetForStory(supabase: SupabaseLike, storyId: string): Promise<SyncTarget | null> {
  const storiesTable = supabase.from('stories') as StoriesTable;
  const { data, error } = await storiesTable
    .select('tasks!inner(activities!inner(story_maps!inner(id, team_id)))')
    .eq('id', storyId)
    .single();
  if (error) throw error;

  const storyMap = data?.tasks?.activities?.story_maps;
  const teamId = storyMap?.team_id;
  if (!teamId) return null;

  const [teamTarget, storyMapOverrides] = await Promise.all([
    getSettingsForTeamId(supabase, teamId),
    storyMap?.id ? getStoryMapLinearOverrides(supabase, storyMap.id) : Promise.resolve(null),
  ]);

  if (!teamTarget) return null;

  return applyStoryMapOverrides(teamTarget, storyMapOverrides);
}
