import type { Story, StoryMapFull, TaskWithStories } from '@/types';

export type DragId =
  | { type: 'activity'; id: string }
  | { type: 'activity-end'; afterActivityId: string }
  | { type: 'task'; id: string }
  | { type: 'story'; id: string }
  | { type: 'task-end'; activityId: string }
  | { type: 'story-end'; taskId: string; releaseId: string | null };

const BACKLOG_MARKER = 'backlog' as const;

export function encodeDragId(dragId: DragId): string {
  switch (dragId.type) {
    case 'activity':
      return `activity:${dragId.id}`;
    case 'activity-end':
      return `activity-end:${dragId.afterActivityId}`;
    case 'task':
      return `task:${dragId.id}`;
    case 'story':
      return `story:${dragId.id}`;
    case 'task-end':
      return `task-end:${dragId.activityId}`;
    case 'story-end':
      return `story-end:${dragId.taskId}:${dragId.releaseId ?? BACKLOG_MARKER}`;
    default:
      throw new Error(`Unsupported drag identifier: ${JSON.stringify(dragId satisfies never)}`);
  }
}

export function parseDragId(encoded: string): DragId | null {
  const parts = encoded.split(':');
  const type = parts[0];

  switch (type) {
    case 'activity':
      return parts[1] ? { type: 'activity', id: parts[1] } : null;
    case 'activity-end':
      return parts[1] ? { type: 'activity-end', afterActivityId: parts[1] } : null;
    case 'task':
      return parts[1] ? { type: 'task', id: parts[1] } : null;
    case 'story':
      return parts[1] ? { type: 'story', id: parts[1] } : null;
    case 'task-end':
      return parts[1] ? { type: 'task-end', activityId: parts[1] } : null;
    case 'story-end': {
      const taskId = parts[1];
      const releaseMarker = parts[2];
      if (!taskId || !releaseMarker) return null;
      return {
        type: 'story-end',
        taskId,
        releaseId: releaseMarker === BACKLOG_MARKER ? null : releaseMarker,
      };
    }
    default:
      return null;
  }
}

function matchesReleaseId(story: Story, releaseId: string | null): boolean {
  return releaseId ? story.release_id === releaseId : !story.release_id;
}

export function reorderActivitiesInStoryMap(storyMap: StoryMapFull, orderedIds: string[]): StoryMapFull {
  const activitiesById = new Map(storyMap.activities.map((activity) => [activity.id, activity]));

  return {
    ...storyMap,
    activities: orderedIds
      .map((activityId, index) => {
        const activity = activitiesById.get(activityId);
        return activity ? { ...activity, sort_order: index } : null;
      })
      .filter((activity): activity is StoryMapFull['activities'][number] => activity !== null),
  };
}

export function moveTaskInStoryMap(
  storyMap: StoryMapFull,
  taskId: string,
  targetActivityId: string,
  orderedIds: string[],
): StoryMapFull {
  const activities = storyMap.activities.map((activity) => ({ ...activity, tasks: [...activity.tasks] }));
  const sourceActivity = activities.find((activity) => activity.tasks.some((task) => task.id === taskId));
  const targetActivity = activities.find((activity) => activity.id === targetActivityId);
  if (!sourceActivity || !targetActivity) return storyMap;

  const sourceIndex = sourceActivity.tasks.findIndex((task) => task.id === taskId);
  if (sourceIndex < 0) return storyMap;
  const [movedTask] = sourceActivity.tasks.splice(sourceIndex, 1);
  if (!movedTask) return storyMap;

  const targetTasks = [...targetActivity.tasks, { ...movedTask, activity_id: targetActivityId }];
  const targetTasksById = new Map(targetTasks.map((task) => [task.id, task]));
  targetActivity.tasks = orderedIds
    .map((orderedId) => targetTasksById.get(orderedId))
    .filter((task): task is (typeof targetTasks)[number] => Boolean(task))
    .map((task, index) => ({ ...task, sort_order: index }));
  sourceActivity.tasks = sourceActivity.tasks.map((task, index) => ({ ...task, sort_order: index }));

  return { ...storyMap, activities };
}

function reorderStoriesForCell(
  stories: Story[],
  releaseId: string | null,
  orderedIds: string[],
  insertedStory?: Story,
): Story[] {
  const otherStories = stories.filter((story) => !matchesReleaseId(story, releaseId));
  const cellStories = stories.filter((story) => matchesReleaseId(story, releaseId));
  const cellStoriesById = new Map(cellStories.map((story) => [story.id, story]));
  if (insertedStory) cellStoriesById.set(insertedStory.id, insertedStory);

  const reorderedCellStories = orderedIds
    .map((storyId) => cellStoriesById.get(storyId))
    .filter((story): story is Story => Boolean(story))
    .map((story, index) => ({ ...story, sort_order: index }));

  return [...otherStories, ...reorderedCellStories];
}

export function moveStoryInStoryMap(
  storyMap: StoryMapFull,
  storyId: string,
  targetTaskId: string,
  targetReleaseId: string | null,
  orderedIds: string[],
): StoryMapFull {
  const activities = storyMap.activities.map((activity) => ({
    ...activity,
    tasks: activity.tasks.map((task) => ({ ...task, stories: [...task.stories] })),
  }));

  let sourceTask: (typeof activities)[number]['tasks'][number] | undefined;
  let movedStory: Story | undefined;
  for (const activity of activities) {
    const task = activity.tasks.find((candidate) => candidate.stories.some((story) => story.id === storyId));
    if (!task) continue;
    const sourceIndex = task.stories.findIndex((story) => story.id === storyId);
    sourceTask = task;
    [movedStory] = task.stories.splice(sourceIndex, 1);
    break;
  }

  if (!sourceTask || !movedStory) return storyMap;
  const sourceReleaseId = movedStory.release_id ?? null;
  const targetTask = activities.flatMap((activity) => activity.tasks).find((task) => task.id === targetTaskId);
  if (!targetTask) return storyMap;

  const nextMovedStory = { ...movedStory, task_id: targetTaskId, release_id: targetReleaseId };
  if (sourceTask.id === targetTask.id && sourceReleaseId === targetReleaseId) {
    sourceTask.stories = reorderStoriesForCell(sourceTask.stories, targetReleaseId, orderedIds, nextMovedStory);
  } else {
    sourceTask.stories = reorderStoriesForCell(
      sourceTask.stories,
      sourceReleaseId,
      sourceTask.stories.filter((story) => matchesReleaseId(story, sourceReleaseId)).map((story) => story.id),
    );
    targetTask.stories = reorderStoriesForCell(targetTask.stories, targetReleaseId, orderedIds, nextMovedStory);
  }

  return { ...storyMap, activities };
}

function storyCellKey(taskId: string, releaseId: string | null): string {
  return `${taskId}:${releaseId ?? BACKLOG_MARKER}`;
}

export function buildStoryMapIndex(storyMap: StoryMapFull) {
  const sortedActivities = [...storyMap.activities].sort((a, b) => a.sort_order - b.sort_order);
  const allTasksOrdered: Array<TaskWithStories & { activityId: string }> = [];
  const tasksByActivityId = new Map<string, Array<TaskWithStories & { activityId: string }>>();
  const storiesByCell = new Map<string, Story[]>();

  for (const activity of sortedActivities) {
    const tasks = [...(activity.tasks ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((task) => ({ ...task, activityId: activity.id }));
    tasksByActivityId.set(activity.id, tasks);
    allTasksOrdered.push(...tasks);

    for (const task of tasks) {
      for (const story of [...task.stories].sort((a, b) => a.sort_order - b.sort_order)) {
        const key = storyCellKey(task.id, story.release_id);
        const stories = storiesByCell.get(key) ?? [];
        stories.push(story);
        storiesByCell.set(key, stories);
      }
    }
  }

  const sortedStories = allTasksOrdered.flatMap((task) => task.stories).sort((a, b) => a.sort_order - b.sort_order);

  return {
    sortedActivities,
    allTasksOrdered,
    sortedStories,
    getTasksForActivity: (activityId: string) => tasksByActivityId.get(activityId) ?? [],
    getStoriesForCell: (taskId: string, releaseId: string | null) =>
      storiesByCell.get(storyCellKey(taskId, releaseId)) ?? [],
  };
}
