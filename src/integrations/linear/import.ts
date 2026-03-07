import { buildStoryPatchFromLinearIssue } from '@beemspec/linear';
import { toStoryMapLinearImportSettings } from '@/integrations/linear/settings';
import { upsertStoryLinearLink } from '@/integrations/linear/story-links';
import type { StoryStatus } from '@/integrations/sync';
import { buildDbUpdateFromPatch } from '@/integrations/sync';
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
  linear_state_id: string | null;
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

interface ActivityRow {
  id: string;
  name: string;
  sort_order: number;
}

interface TaskRow {
  id: string;
  name: string;
  sort_order: number;
}

interface StoryInsertRow {
  id: string;
  updated_at: string;
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
    .select('story_map_id, linear_project_id, linear_state_id, auto_import_labeled_issues, import_label_name')
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

export async function ensureUntriagedTaskId(supabase: Supabase, storyMapId: string): Promise<string> {
  const untriagedName = 'Untriaged';
  const { data: activitiesData, error: activitiesError } = await supabase
    .from('activities')
    .select('id, name, sort_order')
    .eq('story_map_id', storyMapId)
    .order('sort_order');

  if (activitiesError) throw activitiesError;

  const activities = (activitiesData ?? []) as ActivityRow[];
  let untriagedActivity = activities.find((activity) => sameName(activity.name, untriagedName));

  if (!untriagedActivity) {
    const { data: createdActivity, error: createActivityError } = await supabase
      .from('activities')
      .insert({ story_map_id: storyMapId, name: untriagedName, description: 'Imported from Linear for triage' })
      .select('id, name, sort_order')
      .single<ActivityRow>();

    if (createActivityError || !createdActivity) {
      throw createActivityError ?? new Error('Failed to create Untriaged activity');
    }

    const reordered = [createdActivity.id, ...activities.map((activity) => activity.id)];
    const { error: reorderError } = await supabase.rpc('reorder_activities', {
      p_story_map_id: storyMapId,
      p_order: reordered,
    });
    if (reorderError) throw reorderError;

    untriagedActivity = createdActivity;
  }

  if (!untriagedActivity) {
    throw new Error('Failed to resolve Untriaged activity');
  }

  const { data: tasksData, error: tasksError } = await supabase
    .from('tasks')
    .select('id, name, sort_order')
    .eq('activity_id', untriagedActivity.id)
    .order('sort_order');
  if (tasksError) throw tasksError;

  const tasks = (tasksData ?? []) as TaskRow[];
  const existingTask = tasks.find((task) => sameName(task.name, untriagedName));
  if (existingTask) return existingTask.id;

  const { data: createdTask, error: createTaskError } = await supabase
    .from('tasks')
    .insert({ activity_id: untriagedActivity.id, name: untriagedName, description: 'Imported Linear issues' })
    .select('id, name, sort_order')
    .single<TaskRow>();

  if (createTaskError || !createdTask) {
    throw createTaskError ?? new Error('Failed to create Untriaged task');
  }

  return createdTask.id;
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
}): Promise<{ storyId: string }> {
  const taskId = await ensureUntriagedTaskId(input.supabase, input.storyMapId);

  const patch = buildStoryPatchFromLinearIssue({
    title: input.title,
    description: input.description,
    stateName: input.stateName,
    updatedAt: input.updatedAt,
  });

  const dbUpdate = buildDbUpdateFromPatch(patch, null);
  const title = normalize(patch.title) ?? normalize(input.title) ?? input.linearIssueIdentifier ?? input.linearIssueId;
  const status = (patch.status ?? 'backlog') as StoryStatus;
  const content = (dbUpdate.content as Record<string, unknown> | null) ?? {
    _version: 1,
    requirements: '',
    acceptance_criteria: '',
  };

  const { data: createdStory, error: createStoryError } = await input.supabase
    .from('stories')
    .insert({
      task_id: taskId,
      release_id: null,
      title,
      status,
      content,
      updated_at: input.updatedAt,
    })
    .select('id, updated_at')
    .single<StoryInsertRow>();

  if (createStoryError || !createdStory) {
    throw createStoryError ?? new Error('Failed to import Linear issue into story map');
  }

  await upsertStoryLinearLink(input.supabase, {
    storyId: createdStory.id,
    linearIssueId: input.linearIssueId,
    linearIssueIdentifier: input.linearIssueIdentifier,
    lastLocalUpdatedAt: input.updatedAt,
    lastLinearUpdatedAt: input.updatedAt,
  });

  return { storyId: createdStory.id };
}
