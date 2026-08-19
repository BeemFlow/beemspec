import type {
  CreateActivity,
  CreatePersona,
  CreateRelease,
  CreateStory,
  CreateStoryMap,
  CreateTask,
  MoveStory,
  MoveTask,
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
import type { Supabase } from '@/lib/supabase/types';
import { pickDefined } from '@/lib/validations';

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
      ? supabase.from('personas').select('*').eq('story_map_id', storyMapId).order('created_at')
      : Promise.resolve({ data: [], error: null }),
  ]);

  return {
    mapResult,
    activitiesResult,
    releasesResult,
    personasResult,
  };
}

export async function getStoryMapMcpContext(
  supabase: Supabase,
  storyMapId: string,
  options?: { includePersonas?: boolean },
) {
  const includePersonas = options?.includePersonas ?? false;
  const [mapResult, activitiesResult, releasesResult, personasResult] = await Promise.all([
    supabase.from('story_maps').select('id, name, description, context_markdown').eq('id', storyMapId).single(),
    supabase
      .from('activities')
      .select(
        'id, story_map_id, name, description, sort_order, tasks(id, activity_id, name, description, sort_order, stories(id, title, status, release_id, sort_order, content))',
      )
      .eq('story_map_id', storyMapId)
      .order('sort_order')
      .order('sort_order', { referencedTable: 'tasks' })
      .order('sort_order', { referencedTable: 'tasks.stories' }),
    supabase
      .from('releases')
      .select('id, story_map_id, name, description, context_markdown, sort_order')
      .eq('story_map_id', storyMapId)
      .order('sort_order'),
    includePersonas
      ? supabase.from('personas').select('*').eq('story_map_id', storyMapId).order('created_at')
      : Promise.resolve({ data: [], error: null }),
  ]);

  return {
    mapResult,
    activitiesResult,
    releasesResult,
    personasResult,
  };
}

export async function getReleaseMcpContext(supabase: Supabase, releaseId: string) {
  const releaseResult = await supabase
    .from('releases')
    .select('id, story_map_id, name, description, context_markdown, sort_order')
    .eq('id', releaseId)
    .single();

  if (releaseResult.error || !releaseResult.data) {
    return {
      releaseResult,
      mapResult: { data: null, error: releaseResult.error },
      activitiesResult: { data: null, error: releaseResult.error },
    };
  }

  const storyMapId = releaseResult.data.story_map_id;
  const [mapResult, activitiesResult] = await Promise.all([
    supabase.from('story_maps').select('id, name, description, context_markdown').eq('id', storyMapId).single(),
    supabase
      .from('activities')
      .select(
        'id, story_map_id, name, description, sort_order, tasks(id, activity_id, name, description, sort_order, stories(id, title, status, release_id, sort_order, content))',
      )
      .eq('story_map_id', storyMapId)
      .order('sort_order')
      .order('sort_order', { referencedTable: 'tasks' })
      .order('sort_order', { referencedTable: 'tasks.stories' }),
  ]);

  return {
    releaseResult,
    mapResult,
    activitiesResult,
  };
}

export async function createStoryMap(supabase: Supabase, input: CreateStoryMap) {
  return supabase
    .from('story_maps')
    .insert({
      team_id: input.team_id,
      name: input.name,
      description: input.description ?? null,
      context_markdown: input.context_markdown ?? null,
    })
    .select()
    .single();
}

export async function updateStoryMap(supabase: Supabase, storyMapId: string, changes: UpdateStoryMap) {
  return supabase.from('story_maps').update(pickDefined(changes)).eq('id', storyMapId).select().single();
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

export async function moveTask(supabase: Supabase, taskId: string, input: MoveTask) {
  return supabase.rpc('move_task_and_reorder', {
    p_task_id: taskId,
    p_target_activity_id: input.target_activity_id,
    p_target_order: input.target_order,
  });
}

export async function createRelease(supabase: Supabase, input: CreateRelease) {
  return supabase
    .from('releases')
    .insert({
      story_map_id: input.story_map_id,
      name: input.name,
      description: input.description ?? null,
      context_markdown: input.context_markdown ?? null,
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

export async function getStory(supabase: Supabase, storyId: string) {
  return supabase.from('stories').select('*').eq('id', storyId).single();
}

export async function createStory(supabase: Supabase, input: CreateStory) {
  return supabase
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
}

export async function updateStory(supabase: Supabase, storyId: string, changes: UpdateStory) {
  return supabase.from('stories').update(pickDefined(changes)).eq('id', storyId).select().single();
}

export async function deleteStory(supabase: Supabase, storyId: string) {
  return supabase.from('stories').delete().eq('id', storyId).select().single();
}

export async function reorderStories(supabase: Supabase, input: ReorderStories) {
  return supabase.rpc('reorder_stories', {
    p_task_id: input.task_id,
    p_release_id: input.release_id,
    p_order: input.order,
  });
}

export async function moveStory(supabase: Supabase, storyId: string, input: MoveStory) {
  return supabase.rpc('move_story_and_reorder', {
    p_story_id: storyId,
    p_target_task_id: input.target_task_id,
    p_target_release_id: input.target_release_id,
    p_target_order: input.target_order,
  });
}

export async function listPersonas(supabase: Supabase, storyMapId: string) {
  return supabase.from('personas').select('*').eq('story_map_id', storyMapId).order('created_at');
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
