import type {
  Activity,
  ActivityWithTasks,
  Release,
  Story,
  StoryMap,
  StoryMapFull,
  Task,
  TaskWithStories,
} from './types';

// ---------------------------------------------------------------------------
// Build nested tree from flat arrays (what you get from a DB query)
// ---------------------------------------------------------------------------

export function buildTree(
  map: StoryMap,
  activities: Activity[],
  tasks: Task[],
  releases: Release[],
  stories: Story[],
): StoryMapFull {
  const storiesByTask = new Map<string, Story[]>();
  for (const story of stories) {
    const existing = storiesByTask.get(story.task_id) ?? [];
    existing.push(story);
    storiesByTask.set(story.task_id, existing);
  }

  const tasksByActivity = new Map<string, TaskWithStories[]>();
  for (const task of [...tasks].sort((a, b) => a.sort_order - b.sort_order)) {
    const taskStories = (storiesByTask.get(task.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
    const taskWithStories: TaskWithStories = { ...task, stories: taskStories };

    const existing = tasksByActivity.get(task.activity_id) ?? [];
    existing.push(taskWithStories);
    tasksByActivity.set(task.activity_id, existing);
  }

  const activityTree: ActivityWithTasks[] = [...activities]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((activity) => ({
      ...activity,
      tasks: tasksByActivity.get(activity.id) ?? [],
    }));

  const sortedReleases = [...releases].sort((a, b) => a.sort_order - b.sort_order);

  return {
    ...map,
    activities: activityTree,
    releases: sortedReleases,
  };
}

// ---------------------------------------------------------------------------
// Flatten tree back to arrays (for persistence)
// ---------------------------------------------------------------------------

export function flattenTree(map: StoryMapFull): {
  map: StoryMap;
  activities: Activity[];
  tasks: Task[];
  releases: Release[];
  stories: Story[];
} {
  const activities: Activity[] = [];
  const tasks: Task[] = [];
  const stories: Story[] = [];

  for (const activity of map.activities) {
    const { tasks: activityTasks, ...activityBase } = activity;
    activities.push(activityBase);

    for (const task of activityTasks) {
      const { stories: taskStories, ...taskBase } = task;
      tasks.push(taskBase);
      stories.push(...taskStories);
    }
  }

  return {
    map: { id: map.id, name: map.name, description: map.description },
    activities,
    tasks,
    releases: [...map.releases],
    stories,
  };
}
