import type { Activity, ActivityWithTasks, Story, StoryMapFull, Task, TaskWithStories } from './types';

// ---------------------------------------------------------------------------
// Reorder — the core spatial algorithm
// ---------------------------------------------------------------------------

/**
 * Moves `movedId` to the position before `targetId` in the list.
 * If targetId is omitted or not found, appends to end.
 * Returns the new ordering as an array of IDs.
 */
export function reorderItems(ids: string[], movedId: string, targetId?: string): string[] {
  const next = ids.filter((id) => id !== movedId);
  if (!targetId) {
    next.push(movedId);
    return next;
  }
  const idx = next.indexOf(targetId);
  if (idx === -1) {
    next.push(movedId);
    return next;
  }
  next.splice(idx, 0, movedId);
  return next;
}

// ---------------------------------------------------------------------------
// Move — re-parent entities across the grid
// ---------------------------------------------------------------------------

/** Move a story to a different cell (change task and/or release). */
export function moveStory(story: Story, toTaskId: string, toReleaseId: string | null): Story {
  return { ...story, task_id: toTaskId, release_id: toReleaseId };
}

/** Move a task to a different activity. */
export function moveTask(task: Task, toActivityId: string): Task {
  return { ...task, activity_id: toActivityId };
}

// ---------------------------------------------------------------------------
// Tree lookups
// ---------------------------------------------------------------------------

/** Get all stories for a specific cell (task x release intersection). */
export function getStoriesForCell(map: StoryMapFull, taskId: string, releaseId: string | null): Story[] {
  for (const activity of map.activities) {
    for (const task of activity.tasks) {
      if (task.id === taskId) {
        return task.stories.filter((s) => s.release_id === releaseId).sort((a, b) => a.sort_order - b.sort_order);
      }
    }
  }
  return [];
}

/** Get all tasks for a specific activity. */
export function getTasksForActivity(map: StoryMapFull, activityId: string): TaskWithStories[] {
  const activity = map.activities.find((a) => a.id === activityId);
  return activity ? [...activity.tasks].sort((a, b) => a.sort_order - b.sort_order) : [];
}

/** Find a story by ID anywhere in the map. */
export function findStory(map: StoryMapFull, storyId: string): Story | undefined {
  for (const activity of map.activities) {
    for (const task of activity.tasks) {
      const story = task.stories.find((s) => s.id === storyId);
      if (story) return story;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Immutable tree CRUD helpers
// ---------------------------------------------------------------------------

function mapTasks(activity: ActivityWithTasks, fn: (task: TaskWithStories) => TaskWithStories): ActivityWithTasks {
  return { ...activity, tasks: activity.tasks.map(fn) };
}

function mapActivities(map: StoryMapFull, fn: (activity: ActivityWithTasks) => ActivityWithTasks): StoryMapFull {
  return { ...map, activities: map.activities.map(fn) };
}

/** Add a story to the map (inserts at end of the target cell). */
export function addStory(map: StoryMapFull, story: Story): StoryMapFull {
  return mapActivities(map, (activity) =>
    mapTasks(activity, (task) => {
      if (task.id !== story.task_id) return task;
      return { ...task, stories: [...task.stories, story] };
    }),
  );
}

/** Remove a story from the map by ID. */
export function removeStory(map: StoryMapFull, storyId: string): StoryMapFull {
  return mapActivities(map, (activity) =>
    mapTasks(activity, (task) => ({
      ...task,
      stories: task.stories.filter((s) => s.id !== storyId),
    })),
  );
}

/** Update a story in the map. Merges the patch into the existing story. */
export function updateStory(map: StoryMapFull, storyId: string, patch: Partial<Story>): StoryMapFull {
  return mapActivities(map, (activity) =>
    mapTasks(activity, (task) => ({
      ...task,
      stories: task.stories.map((s) => (s.id === storyId ? { ...s, ...patch } : s)),
    })),
  );
}

/** Add an activity to the map. */
export function addActivity(map: StoryMapFull, activity: ActivityWithTasks): StoryMapFull {
  return { ...map, activities: [...map.activities, activity] };
}

/** Remove an activity from the map. */
export function removeActivity(map: StoryMapFull, activityId: string): StoryMapFull {
  return { ...map, activities: map.activities.filter((a) => a.id !== activityId) };
}

/** Add a task to a specific activity. */
export function addTask(map: StoryMapFull, activityId: string, task: TaskWithStories): StoryMapFull {
  return mapActivities(map, (activity) => {
    if (activity.id !== activityId) return activity;
    return { ...activity, tasks: [...activity.tasks, task] };
  });
}

/** Remove a task from the map. */
export function removeTask(map: StoryMapFull, taskId: string): StoryMapFull {
  return mapActivities(map, (activity) => ({
    ...activity,
    tasks: activity.tasks.filter((t) => t.id !== taskId),
  }));
}

/** Add a release to the map. */
export function addRelease(
  map: StoryMapFull,
  release: { id: string; story_map_id: string; name: string; description?: string | null; sort_order: number },
): StoryMapFull {
  return { ...map, releases: [...map.releases, release] };
}

/** Remove a release from the map. */
export function removeRelease(map: StoryMapFull, releaseId: string): StoryMapFull {
  return { ...map, releases: map.releases.filter((r) => r.id !== releaseId) };
}
