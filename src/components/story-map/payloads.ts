import type { CreateStoryMap, MoveStory, Story, StoryMapFull, UpdateStory } from '@beemspec/storymap';

export type StoryEditSave = UpdateStory & {
  release_id?: string | null;
};

export function buildCreateStoryMapPayload(teamId: string, name: string, description: string): CreateStoryMap {
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();

  if (!trimmedName) {
    throw new Error('Story map name is required');
  }

  return {
    team_id: teamId,
    name: trimmedName,
    ...(trimmedDescription ? { description: trimmedDescription } : {}),
  };
}

export function planStoryEditSave(
  storyMap: StoryMapFull | null,
  originalStory: Story,
  storyData: StoryEditSave,
): { updates: UpdateStory; move: MoveStory | null } {
  const { release_id, ...updates } = storyData;

  let move: MoveStory | null = null;

  if (storyMap && release_id !== undefined && release_id !== originalStory.release_id) {
    const targetTask = storyMap.activities
      .flatMap((activity) => activity.tasks)
      .find((task) => task.id === originalStory.task_id);

    if (!targetTask) {
      throw new Error(`Task ${originalStory.task_id} not found while planning story move`);
    }

    const targetOrder = targetTask.stories
      .filter((story) => story.id !== originalStory.id && story.release_id === release_id)
      .map((story) => story.id);

    targetOrder.push(originalStory.id);

    move = {
      target_task_id: originalStory.task_id,
      target_release_id: release_id,
      target_order: targetOrder,
    };
  }

  return { updates, move };
}
