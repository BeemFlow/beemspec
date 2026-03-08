import type {
  CreateActivity,
  CreatePersona,
  CreateRelease,
  CreateStory,
  CreateStoryMap,
  CreateTask,
  ReorderActivities,
  ReorderReleases,
  ReorderStories,
  ReorderTasks,
  UpdateActivity,
  UpdatePersona,
  UpdateRelease,
  UpdateStory,
  UpdateStoryMap,
  UpdateTask,
} from '@beemspec/storymap';
import { isLinearSyncAvailableForStoryMap, resolveLinearSyncContextForStory } from '@/integrations/linear/auth';
import { getStoryLinearLink } from '@/integrations/linear/story-links';
import { processStoryLinearSyncById } from '@/integrations/linear/sync-story-by-id';
import type { Supabase } from '@/lib/supabase/types';
import { pickDefined } from '@/lib/validations';
import { loadStoryWithStoryMap } from './story-context';

export async function listStoryMaps(supabase: Supabase, teamId: string) {
  return supabase.from('story_maps').select('*').eq('team_id', teamId).order('updated_at', { ascending: false });
}

export async function getStoryMapGraph(
  supabase: Supabase,
  storyMapId: string,
  options?: { includePersonas?: boolean },
) {
  const includePersonas = options?.includePersonas ?? false;
  const [mapResult, activitiesResult, releasesResult, personasResult] = await Promise.all([
    supabase.from('story_maps').select('*').eq('id', storyMapId).single(),
    supabase
      .from('activities')
      .select('*, tasks(*, stories(*))')
      .eq('story_map_id', storyMapId)
      .order('sort_order')
      .order('sort_order', { referencedTable: 'tasks' })
      .order('sort_order', { referencedTable: 'tasks.stories' }),
    supabase.from('releases').select('*').eq('story_map_id', storyMapId).order('sort_order'),
    includePersonas
      ? supabase.from('personas').select('*').eq('story_map_id', storyMapId).order('sort_order')
      : Promise.resolve({ data: [], error: null }),
  ]);

  return {
    mapResult,
    activitiesResult,
    releasesResult,
    personasResult,
  };
}

export async function createStoryMap(supabase: Supabase, input: CreateStoryMap) {
  return supabase
    .from('story_maps')
    .insert({
      team_id: input.team_id,
      name: input.name,
      description: input.description ?? null,
    })
    .select()
    .single();
}

export async function updateStoryMap(supabase: Supabase, storyMapId: string, changes: UpdateStoryMap) {
  return supabase
    .from('story_maps')
    .update({
      ...pickDefined(changes),
      updated_at: new Date().toISOString(),
    })
    .eq('id', storyMapId)
    .select()
    .single();
}

export async function deleteStoryMap(supabase: Supabase, storyMapId: string) {
  return supabase.from('story_maps').delete().eq('id', storyMapId).select().single();
}

export async function createActivity(supabase: Supabase, input: CreateActivity) {
  return supabase
    .from('activities')
    .insert({
      story_map_id: input.story_map_id,
      name: input.name,
      description: input.description ?? null,
    })
    .select()
    .single();
}

export async function updateActivity(supabase: Supabase, activityId: string, changes: UpdateActivity) {
  return supabase.from('activities').update(pickDefined(changes)).eq('id', activityId).select().single();
}

export async function deleteActivity(supabase: Supabase, activityId: string) {
  return supabase.from('activities').delete().eq('id', activityId).select().single();
}

export async function reorderActivities(supabase: Supabase, input: ReorderActivities) {
  return supabase.rpc('reorder_activities', {
    p_story_map_id: input.story_map_id,
    p_order: input.order,
  });
}

export async function createTask(supabase: Supabase, input: CreateTask) {
  return supabase
    .from('tasks')
    .insert({
      activity_id: input.activity_id,
      name: input.name,
      description: input.description ?? null,
    })
    .select()
    .single();
}

export async function updateTask(supabase: Supabase, taskId: string, changes: UpdateTask) {
  return supabase.from('tasks').update(pickDefined(changes)).eq('id', taskId).select().single();
}

export async function deleteTask(supabase: Supabase, taskId: string) {
  return supabase.from('tasks').delete().eq('id', taskId).select().single();
}

export async function reorderTasks(supabase: Supabase, input: ReorderTasks) {
  return supabase.rpc('reorder_tasks', {
    p_activity_id: input.activity_id,
    p_order: input.order,
  });
}

export async function createRelease(supabase: Supabase, input: CreateRelease) {
  return supabase
    .from('releases')
    .insert({
      story_map_id: input.story_map_id,
      name: input.name,
      description: input.description ?? null,
    })
    .select()
    .single();
}

export async function updateRelease(supabase: Supabase, releaseId: string, changes: UpdateRelease) {
  return supabase.from('releases').update(pickDefined(changes)).eq('id', releaseId).select().single();
}

export async function deleteRelease(supabase: Supabase, releaseId: string) {
  return supabase.from('releases').delete().eq('id', releaseId).select().single();
}

export async function reorderReleases(supabase: Supabase, input: ReorderReleases) {
  return supabase.rpc('reorder_releases', {
    p_story_map_id: input.story_map_id,
    p_order: input.order,
  });
}

async function maybeSyncStoryToLinear(supabase: Supabase, storyId: string) {
  const context = await loadStoryWithStoryMap(supabase, storyId);
  if (!context.ok) return null;

  const linearSyncEnabled = await isLinearSyncAvailableForStoryMap(supabase, {
    storyMapId: context.data.storyMapId,
  });
  if (!linearSyncEnabled) return null;

  return processStoryLinearSyncById(supabase, {
    storyId,
  });
}

export async function getStory(supabase: Supabase, storyId: string) {
  return supabase.from('stories').select('*').eq('id', storyId).single();
}

export async function createStory(supabase: Supabase, input: CreateStory) {
  const created = await supabase
    .from('stories')
    .insert({
      task_id: input.task_id,
      release_id: input.release_id ?? null,
      title: input.title,
      content: input.content,
      status: input.status,
    })
    .select()
    .single();

  if (created.error || !created.data) {
    return { data: created.data, error: created.error };
  }

  try {
    const linearIssue = await maybeSyncStoryToLinear(supabase, created.data.id);
    if (!linearIssue) return created;

    return {
      data: {
        ...created.data,
        linear_sync: {
          status: 'synced',
          linear_issue_id: linearIssue.id,
          linear_issue_identifier: linearIssue.identifier,
        },
      },
      error: null,
    };
  } catch (syncError) {
    // biome-ignore lint/suspicious/noConsole: best-effort outbound sync
    console.error('Failed to sync story to Linear', syncError);
    return created;
  }
}

export async function updateStory(supabase: Supabase, storyId: string, changes: UpdateStory) {
  const updated = await supabase
    .from('stories')
    .update({
      ...pickDefined(changes),
      updated_at: new Date().toISOString(),
    })
    .eq('id', storyId)
    .select()
    .single();

  if (updated.error || !updated.data) {
    return { data: updated.data, error: updated.error };
  }

  try {
    const linearIssue = await maybeSyncStoryToLinear(supabase, updated.data.id);
    if (!linearIssue) return updated;

    return {
      data: {
        ...updated.data,
        linear_sync: {
          status: 'synced',
          linear_issue_id: linearIssue.id,
          linear_issue_identifier: linearIssue.identifier,
        },
      },
      error: null,
    };
  } catch (syncError) {
    // biome-ignore lint/suspicious/noConsole: best-effort outbound sync
    console.error('Failed to sync story to Linear', syncError);
    return updated;
  }
}

export async function deleteStory(supabase: Supabase, storyId: string) {
  try {
    const link = await getStoryLinearLink(supabase, storyId);
    if (link) {
      const context = await resolveLinearSyncContextForStory(supabase, {
        storyId,
      });
      const issueSync = context.linearIssueSync;

      if (!issueSync) {
        // Proceed with local delete when remote sync is unavailable.
        return supabase.from('stories').delete().eq('id', storyId).select().single();
      }

      try {
        await issueSync.deleteIssue(link.linearIssueId);
      } catch (error) {
        const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : null;
        if (status !== 404) {
          // best-effort remote delete; local story delete proceeds
          // biome-ignore lint/suspicious/noConsole: operational visibility for remote delete failures
          console.warn('Failed to delete linked Linear issue; proceeding with local delete', error);
        }
      }
    }
  } catch (error) {
    // best-effort link lookup; local story delete proceeds
    // biome-ignore lint/suspicious/noConsole: operational visibility for lookup failures
    console.warn('Failed to load linked Linear issue for deletion; proceeding with local delete', error);
  }

  return supabase.from('stories').delete().eq('id', storyId).select().single();
}

export async function reorderStories(supabase: Supabase, input: ReorderStories) {
  return supabase.rpc('reorder_stories', {
    p_task_id: input.task_id,
    p_release_id: input.release_id,
    p_order: input.order,
  });
}

export async function listPersonas(supabase: Supabase, storyMapId: string) {
  return supabase.from('personas').select('*').eq('story_map_id', storyMapId).order('sort_order');
}

export async function createPersona(supabase: Supabase, input: CreatePersona) {
  return supabase
    .from('personas')
    .insert({
      story_map_id: input.story_map_id,
      name: input.name,
      description: input.description ?? null,
      goals: input.goals ?? null,
    })
    .select()
    .single();
}

export async function updatePersona(supabase: Supabase, personaId: string, changes: UpdatePersona) {
  return supabase.from('personas').update(pickDefined(changes)).eq('id', personaId).select().single();
}

export async function deletePersona(supabase: Supabase, personaId: string) {
  return supabase.from('personas').delete().eq('id', personaId).select().single();
}
