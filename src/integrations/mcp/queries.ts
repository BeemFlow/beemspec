import type { SupabaseLike } from '@/lib/supabase/types';

interface StoryContext {
  storyId: string;
  storyTitle: string;
  storyStatus: string;
  storySortOrder: number;
  storyMapId: string;
  storyMapName: string;
  storyMapDescription: string | null;
  activityId: string;
  activityName: string;
  activityDescription: string | null;
  activitySortOrder: number;
  taskId: string;
  taskName: string;
  taskDescription: string | null;
  taskSortOrder: number;
  releaseId: string | null;
  releaseName: string | null;
  releaseDescription: string | null;
  releaseSortOrder: number | null;
  requirements: string;
  acceptanceCriteria: string;
  edgeCases: string | null;
  technicalGuidelines: string | null;
  figmaLink: string | null;
  personas: Array<{
    id: string;
    name: string;
    description: string | null;
    goals: string | null;
  }>;
  agentGuidance: {
    recommendedReadSequence: string[];
    storyMappingTips: string[];
    figma: {
      hasFigmaLink: boolean;
      figmaLink: string | null;
      recommendedNextStep: string | null;
      recommendedTools: string[];
    };
  };
}

interface StoryContextRow {
  id: string;
  task_id: string;
  release_id: string | null;
  sort_order: number;
  status: string;
  title: string;
  content: {
    requirements?: string;
    acceptance_criteria?: string;
    edge_cases?: string | null;
    technical_guidelines?: string | null;
    figma_link?: string | null;
  };
}

interface TaskRow {
  id: string;
  activity_id: string;
  name: string;
  description: string | null;
  sort_order: number;
}

interface ActivityRow {
  id: string;
  story_map_id: string;
  name: string;
  description: string | null;
  sort_order: number;
}

interface ReleaseRow {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
}

interface StoryMapRow {
  id: string;
  name: string;
  description: string | null;
}

interface PersonaRow {
  id: string;
  name: string;
  description: string | null;
  goals: string | null;
}

interface SingleRowTable<T> {
  select(columns: string): {
    eq(column: string, value: string): { single(): Promise<{ data: T | null; error: unknown }> };
  };
}

interface PersonaTable {
  select(columns: string): {
    eq(
      column: string,
      value: string,
    ): {
      order(column: string): Promise<{ data: PersonaRow[] | null; error: unknown }>;
    };
  };
}

function buildAgentGuidance(figmaLink: string | null) {
  const hasFigmaLink = Boolean(figmaLink);

  return {
    recommendedReadSequence: [
      '1) If you still need release-wide planning context, call storymap_get first; otherwise use this response directly.',
      '2) Use this story context to implement or refine the selected story without losing map context.',
      '3) Use story_update for content/status changes and move/reorder tools for placement changes.',
      '4) Re-read with storymap_get only after structural edits or release planning changes.',
    ],
    storyMappingTips: [
      'Keep the story aligned to the user workflow and release intent, not implementation layers.',
      'Use personas only when they materially change the workflow, acceptance criteria, or release choice.',
      'Prefer thin end-to-end slices that deliver user-visible progress and are testable from acceptance criteria.',
    ],
    figma: {
      hasFigmaLink,
      figmaLink,
      recommendedNextStep: hasFigmaLink
        ? 'A Figma link is attached. If the Figma MCP server is connected in this agent session, fetch design context from the link before implementing UI changes.'
        : null,
      recommendedTools: hasFigmaLink ? ['figma_get_design_context', 'figma_get_screenshot'] : [],
    },
  };
}

export async function getStoryContext(supabase: SupabaseLike, storyId: string): Promise<StoryContext | null> {
  const storiesTable = supabase.from('stories') as SingleRowTable<StoryContextRow>;
  const { data: story, error: storyError } = await storiesTable
    .select('id, task_id, release_id, sort_order, status, title, content')
    .eq('id', storyId)
    .single();

  if (storyError || !story) return null;

  const tasksTable = supabase.from('tasks') as SingleRowTable<TaskRow>;
  const { data: task, error: taskError } = await tasksTable
    .select('id, activity_id, name, description, sort_order')
    .eq('id', story.task_id)
    .single();
  if (taskError || !task) return null;

  const activitiesTable = supabase.from('activities') as SingleRowTable<ActivityRow>;
  const { data: activity, error: activityError } = await activitiesTable
    .select('id, story_map_id, name, description, sort_order')
    .eq('id', task.activity_id)
    .single();
  if (activityError || !activity) return null;

  const storyMapsTable = supabase.from('story_maps') as SingleRowTable<StoryMapRow>;
  const { data: storyMap, error: storyMapError } = await storyMapsTable
    .select('id, name, description')
    .eq('id', activity.story_map_id)
    .single();
  if (storyMapError || !storyMap) return null;

  const personasTable = supabase.from('personas') as PersonaTable;
  const { data: personas, error: personasError } = await personasTable
    .select('id, name, description, goals')
    .eq('story_map_id', storyMap.id)
    .order('created_at');
  if (personasError) return null;

  let release: ReleaseRow | null = null;
  if (story.release_id) {
    const releasesTable = supabase.from('releases') as SingleRowTable<ReleaseRow>;
    const { data: releaseRow, error: releaseError } = await releasesTable
      .select('id, name, description, sort_order')
      .eq('id', story.release_id)
      .single();
    if (releaseError || !releaseRow) return null;
    release = releaseRow;
  }

  const content = story.content ?? {};
  const figmaLink = content.figma_link ?? null;

  return {
    storyId: story.id,
    storyTitle: story.title,
    storyStatus: story.status,
    storySortOrder: story.sort_order,
    storyMapId: storyMap.id,
    storyMapName: storyMap.name,
    storyMapDescription: storyMap.description ?? null,
    activityId: activity.id,
    activityName: activity.name,
    activityDescription: activity.description ?? null,
    activitySortOrder: activity.sort_order,
    taskId: task.id,
    taskName: task.name,
    taskDescription: task.description ?? null,
    taskSortOrder: task.sort_order,
    releaseId: release?.id ?? null,
    releaseName: release?.name ?? null,
    releaseDescription: release?.description ?? null,
    releaseSortOrder: release?.sort_order ?? null,
    requirements: content.requirements ?? '',
    acceptanceCriteria: content.acceptance_criteria ?? '',
    edgeCases: content.edge_cases ?? null,
    technicalGuidelines: content.technical_guidelines ?? null,
    figmaLink,
    personas: personas ?? [],
    agentGuidance: buildAgentGuidance(figmaLink),
  };
}
