import { afterEach, describe, expect, it } from 'vitest';
import { createLocalSupabaseAdminClient } from '@/test/local-supabase';
import {
  createActivity,
  createRelease,
  createStory,
  createStoryMap,
  createTask,
  getStory,
  moveStory,
  moveTask,
} from './service';

const supabase = createLocalSupabaseAdminClient();
const createdTeamIds: string[] = [];

async function createTeam(name: string) {
  const result = await supabase.from('teams').insert({ name }).select().single();
  if (result.error || !result.data) {
    throw new Error(`Failed to create team fixture: ${result.error ? JSON.stringify(result.error) : 'no data'}`);
  }
  createdTeamIds.push(result.data.id);
  return result.data;
}

async function must<T>(resultPromise: Promise<{ data: T | null; error: unknown }>, message: string) {
  const result = await resultPromise;
  if (result.error || !result.data) {
    throw new Error(`${message}: ${result.error ? JSON.stringify(result.error) : 'no data returned'}`);
  }
  return result.data;
}

async function mustSucceed(resultPromise: Promise<{ error: unknown }>, message: string) {
  const result = await resultPromise;
  if (result.error) {
    throw new Error(`${message}: ${JSON.stringify(result.error)}`);
  }
}

describe.sequential('storymap service integration', () => {
  afterEach(async () => {
    while (createdTeamIds.length > 0) {
      const teamId = createdTeamIds.pop();
      if (!teamId) continue;
      await supabase.from('teams').delete().eq('id', teamId);
    }
  });

  it('persists move RPC changes with real sort-order updates in local Supabase', async () => {
    const team = await createTeam(`Integration Team ${crypto.randomUUID()}`);
    const storyMap = await must(
      createStoryMap(supabase as never, { team_id: team.id, name: 'Accounts Payable' }),
      'Failed to create story map',
    );

    const intake = await must(
      createActivity(supabase as never, { story_map_id: storyMap.id, name: 'Intake' }),
      'Failed to create intake activity',
    );
    const review = await must(
      createActivity(supabase as never, { story_map_id: storyMap.id, name: 'Review' }),
      'Failed to create review activity',
    );

    const captureTask = await must(
      createTask(supabase as never, { activity_id: intake.id, name: 'Capture invoice' }),
      'Failed to create capture task',
    );
    const triageTask = await must(
      createTask(supabase as never, { activity_id: intake.id, name: 'Triage exception' }),
      'Failed to create triage task',
    );
    const approveTask = await must(
      createTask(supabase as never, { activity_id: review.id, name: 'Approve payment' }),
      'Failed to create approve task',
    );

    expect(captureTask.sort_order).toBe(0);
    expect(triageTask.sort_order).toBe(1);
    expect(approveTask.sort_order).toBe(0);

    await mustSucceed(
      moveTask(supabase as never, triageTask.id, {
        target_activity_id: review.id,
        target_order: [triageTask.id, approveTask.id],
      }),
      'Failed to move task',
    );

    const movedTasks = await supabase
      .from('tasks')
      .select('id, activity_id, sort_order')
      .in('id', [captureTask.id, triageTask.id, approveTask.id])
      .order('sort_order');
    const tasksById = new Map((movedTasks.data ?? []).map((task) => [task.id, task]));

    expect(tasksById.get(captureTask.id)).toMatchObject({ activity_id: intake.id, sort_order: 0 });
    expect(tasksById.get(triageTask.id)).toMatchObject({ activity_id: review.id, sort_order: 0 });
    expect(tasksById.get(approveTask.id)).toMatchObject({ activity_id: review.id, sort_order: 1 });

    const release = await must(
      createRelease(supabase as never, { story_map_id: storyMap.id, name: 'Release 1' }),
      'Failed to create release',
    );
    const backlogStory = await must(
      createStory(supabase as never, {
        task_id: captureTask.id,
        title: 'Capture invoice data',
        status: 'backlog',
        content: {
          _version: 1,
          user_story: 'As an AP clerk, I can capture invoice data.',
          acceptance_criteria: '- [ ] Required fields are stored',
        },
      }),
      'Failed to create backlog story',
    );
    const releaseStory = await must(
      createStory(supabase as never, {
        task_id: approveTask.id,
        release_id: release.id,
        title: 'Approve payment',
        status: 'todo',
        content: {
          _version: 1,
          user_story: 'As a manager, I can approve payment.',
          acceptance_criteria: '- [ ] Approval changes payment status',
        },
      }),
      'Failed to create release story',
    );

    expect(backlogStory.sort_order).toBe(0);
    expect(releaseStory.sort_order).toBe(0);

    await mustSucceed(
      moveStory(supabase as never, backlogStory.id, {
        target_task_id: approveTask.id,
        target_release_id: release.id,
        target_order: [backlogStory.id, releaseStory.id],
      }),
      'Failed to move story',
    );

    const movedStory = await must(getStory(supabase as never, backlogStory.id), 'Failed to reload moved story');
    const siblingStories = await supabase
      .from('stories')
      .select('id, task_id, release_id, sort_order')
      .in('id', [backlogStory.id, releaseStory.id])
      .order('sort_order');
    const storiesById = new Map((siblingStories.data ?? []).map((story) => [story.id, story]));

    expect(movedStory).toMatchObject({ task_id: approveTask.id, release_id: release.id, sort_order: 0 });
    expect(storiesById.get(releaseStory.id)).toMatchObject({
      task_id: approveTask.id,
      release_id: release.id,
      sort_order: 1,
    });
  }, 15_000);

  it('enforces real cross-map parent consistency in the database', async () => {
    const firstTeam = await createTeam(`First Team ${crypto.randomUUID()}`);
    const secondTeam = await createTeam(`Second Team ${crypto.randomUUID()}`);

    const firstMap = await must(
      createStoryMap(supabase as never, { team_id: firstTeam.id, name: 'Map A' }),
      'Failed to create first map',
    );
    const secondMap = await must(
      createStoryMap(supabase as never, { team_id: secondTeam.id, name: 'Map B' }),
      'Failed to create second map',
    );

    const firstActivity = await must(
      createActivity(supabase as never, { story_map_id: firstMap.id, name: 'Activity A' }),
      'Failed to create first activity',
    );
    const firstTask = await must(
      createTask(supabase as never, { activity_id: firstActivity.id, name: 'Task A' }),
      'Failed to create first task',
    );
    const secondRelease = await must(
      createRelease(supabase as never, { story_map_id: secondMap.id, name: 'Release B' }),
      'Failed to create second release',
    );

    const result = await createStory(supabase as never, {
      task_id: firstTask.id,
      release_id: secondRelease.id,
      title: 'Invalid cross-map story',
      status: 'todo',
      content: {
        _version: 1,
        user_story: 'As a tester, I should fail on inconsistent parents.',
        acceptance_criteria: '- [ ] The database rejects the write',
      },
    });

    expect(result.data).toBeNull();
    expect(JSON.stringify(result.error)).toContain('Story task and release must belong to the same story map');
  });
});
