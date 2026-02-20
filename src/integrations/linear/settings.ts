import type { SyncTarget } from '@/integrations/sync';
import { normalize } from '@/lib/strings';
import type { SupabaseLike } from '@/lib/supabase/types';

interface IntegrationSettingsRow {
  linear_team_id: string | null;
  linear_project_id: string | null;
  linear_state_id: string | null;
}

interface StoriesTable {
  select(columns: string): {
    eq(
      column: string,
      value: string,
    ): {
      single(): Promise<{
        data: { tasks: { activities: { story_maps: { team_id: string } | null } | null } | null } | null;
        error: unknown;
      }>;
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

function toLinearTarget(row: IntegrationSettingsRow | null): SyncTarget | null {
  if (!row) return null;

  const teamId = normalize(row.linear_team_id);
  if (!teamId) return null;

  return {
    teamId,
    projectId: normalize(row.linear_project_id) ?? undefined,
    stateId: normalize(row.linear_state_id) ?? undefined,
  };
}

async function getSettingsForTeamId(supabase: SupabaseLike, teamId: string): Promise<SyncTarget | null> {
  const table = supabase.from('integration_settings') as IntegrationSettingsTable;
  const { data, error } = await table
    .select('linear_team_id, linear_project_id, linear_state_id')
    .eq('team_id', teamId)
    .maybeSingle();

  if (error) throw error;
  return toLinearTarget(data);
}

async function getTeamIdForStoryMapInternal(supabase: SupabaseLike, storyMapId: string): Promise<TeamIdResult> {
  try {
    const storyMapsTable = supabase.from('story_maps') as StoryMapsTable;
    const { data, error } = await storyMapsTable.select('team_id').eq('id', storyMapId).single();
    if (error) throw error;
    return { teamId: data?.team_id ?? null };
  } catch {
    return { teamId: null };
  }
}

export async function getTeamIdForStoryMap(supabase: SupabaseLike, storyMapId: string): Promise<string | null> {
  const result = await getTeamIdForStoryMapInternal(supabase, storyMapId);
  return result.teamId;
}

export async function getSyncTargetForStoryMap(supabase: SupabaseLike, storyMapId: string): Promise<SyncTarget | null> {
  const result = await getTeamIdForStoryMapInternal(supabase, storyMapId);
  if (!result.teamId) return null;
  return getSettingsForTeamId(supabase, result.teamId);
}

export async function getSyncTargetForStory(supabase: SupabaseLike, storyId: string): Promise<SyncTarget | null> {
  try {
    const storiesTable = supabase.from('stories') as StoriesTable;
    const { data, error } = await storiesTable
      .select('tasks!inner(activities!inner(story_maps!inner(team_id)))')
      .eq('id', storyId)
      .single();
    if (error) throw error;

    const teamId = data?.tasks?.activities?.story_maps?.team_id;
    if (!teamId) return null;

    return getSettingsForTeamId(supabase, teamId);
  } catch {
    return null;
  }
}

export async function getTeamIdForStory(supabase: SupabaseLike, storyId: string): Promise<string | null> {
  try {
    const storiesTable = supabase.from('stories') as StoriesTable;
    const { data, error } = await storiesTable
      .select('tasks!inner(activities!inner(story_maps!inner(team_id)))')
      .eq('id', storyId)
      .single();
    if (error) throw error;

    return data?.tasks?.activities?.story_maps?.team_id ?? null;
  } catch {
    return null;
  }
}
