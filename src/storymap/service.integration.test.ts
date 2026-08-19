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

async function mustSucceed(resultPromise: PromiseLike<{ error: unknown }>, message: string) {
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
    const routeTask = await must(
      createTask(supabase as never, { activity_id: intake.id, name: 'Route exception' }),
      'Failed to create route task',
    );
    const approveTask = await must(
      createTask(supabase as never, { activity_id: review.id, name: 'Approve payment' }),
      'Failed to create approve task',
    );

    expect(captureTask.sort_order).toBe(0);
    expect(triageTask.sort_order).toBe(1);
    expect(routeTask.sort_order).toBe(2);
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
      .in('id', [captureTask.id, triageTask.id, routeTask.id, approveTask.id])
      .order('sort_order');
    const tasksById = new Map((movedTasks.data ?? []).map((task) => [task.id, task]));

    expect(tasksById.get(captureTask.id)).toMatchObject({ activity_id: intake.id, sort_order: 0 });
    expect(tasksById.get(routeTask.id)).toMatchObject({ activity_id: intake.id, sort_order: 1 });
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
    const remainingBacklogStory = await must(
      createStory(supabase as never, {
        task_id: captureTask.id,
        title: 'Validate invoice data',
        status: 'backlog',
        content: {
          _version: 1,
          user_story: 'As an AP clerk, I can validate invoice data.',
          acceptance_criteria: '- [ ] Invalid fields are identified',
        },
      }),
      'Failed to create remaining backlog story',
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
    expect(remainingBacklogStory.sort_order).toBe(1);
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

    const sourceStories = await supabase
      .from('stories')
      .select('id, sort_order')
      .eq('task_id', captureTask.id)
      .is('release_id', null)
      .order('sort_order');
    expect(sourceStories.data).toEqual([{ id: remainingBacklogStory.id, sort_order: 0 }]);
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

  it('imports the same Linear delivery exactly once and creates a leading Untriaged lane', async () => {
    const team = await createTeam(`Import Team ${crypto.randomUUID()}`);
    const storyMap = await must(
      createStoryMap(supabase as never, { team_id: team.id, name: 'Import Map' }),
      'Failed to create import map',
    );
    await must(
      createActivity(supabase as never, { story_map_id: storyMap.id, name: 'Existing activity' }),
      'Failed to create existing activity',
    );

    const issueId = `linear-${crypto.randomUUID()}`;
    const deliveryId = `delivery-${crypto.randomUUID()}`;
    const importedAt = new Date().toISOString();
    const args = {
      p_story_map_id: storyMap.id,
      p_linear_issue_id: issueId,
      p_linear_issue_identifier: 'BEE-101',
      p_story_title: 'Imported once',
      p_story_status: 'backlog',
      p_story_content: { _version: 1, user_story: '', acceptance_criteria: '' },
      p_story_updated_at: importedAt,
      p_idempotency_key: deliveryId,
      p_event_type: 'Issue',
      p_event_action: 'create',
      p_payload: { id: issueId },
    };

    const [first, second] = await Promise.all([
      supabase
        .rpc('import_linear_issue_into_story_map', args)
        .single<{ duplicate: boolean; story_id: string | null }>(),
      supabase
        .rpc('import_linear_issue_into_story_map', args)
        .single<{ duplicate: boolean; story_id: string | null }>(),
    ]);

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect([first.data?.duplicate, second.data?.duplicate].sort()).toEqual([false, true]);
    expect(first.data?.story_id).toBe(second.data?.story_id);

    const stories = await supabase.from('stories').select('id').eq('title', 'Imported once');
    const links = await supabase.from('story_linear_links').select('story_id').eq('linear_issue_id', issueId);
    const activities = await supabase
      .from('activities')
      .select('name, sort_order')
      .eq('story_map_id', storyMap.id)
      .order('sort_order');

    expect(stories.error).toBeNull();
    expect(stories.data).toHaveLength(1);
    expect(links.error).toBeNull();
    expect(links.data).toEqual([{ story_id: stories.data?.[0]?.id }]);
    expect(activities.data?.map(({ name, sort_order }) => ({ name, sort_order }))).toEqual([
      { name: 'Untriaged', sort_order: 0 },
      { name: 'Existing activity', sort_order: 1 },
    ]);
  });

  it('rejects a Linear writeback when a local edit wins the compare-and-swap race', async () => {
    const team = await createTeam(`Conflict Team ${crypto.randomUUID()}`);
    const storyMap = await must(
      createStoryMap(supabase as never, { team_id: team.id, name: 'Conflict Map' }),
      'Failed to create conflict map',
    );
    const activity = await must(
      createActivity(supabase as never, { story_map_id: storyMap.id, name: 'Activity' }),
      'Failed to create activity',
    );
    const task = await must(
      createTask(supabase as never, { activity_id: activity.id, name: 'Task' }),
      'Failed to create task',
    );
    const story = await must(
      createStory(supabase as never, {
        task_id: task.id,
        title: 'Original title',
        status: 'backlog',
        content: { _version: 1, user_story: '', acceptance_criteria: '' },
      }),
      'Failed to create story',
    );

    const staleVersion = story.updated_at;
    await mustSucceed(
      supabase.from('stories').update({ title: 'Local edit wins' }).eq('id', story.id),
      'Failed to create concurrent local edit',
    );

    const deliveryId = `delivery-${crypto.randomUUID()}`;
    const result = await supabase
      .rpc('apply_linear_issue_writeback_with_receipt', {
        p_story_id: story.id,
        p_linear_issue_id: `linear-${crypto.randomUUID()}`,
        p_linear_issue_identifier: 'BEE-102',
        p_expected_story_updated_at: staleVersion,
        p_last_linear_updated_at: new Date().toISOString(),
        p_story_title: 'Remote overwrite',
        p_story_status: 'done',
        p_story_content: null,
        p_idempotency_key: deliveryId,
        p_event_type: 'Issue',
        p_event_action: 'update',
        p_payload: { title: 'Remote overwrite' },
      })
      .single();

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ duplicate: false, applied: false, conflict: true });

    const reloadedStory = await supabase.from('stories').select('title, status').eq('id', story.id).single();
    const receipt = await supabase
      .from('integration_webhook_receipts')
      .select('status, error')
      .eq('provider', 'linear')
      .eq('idempotency_key', deliveryId)
      .single();

    expect(reloadedStory.data).toMatchObject({ title: 'Local edit wins', status: 'backlog' });
    expect(receipt.data).toMatchObject({
      status: 'ignored',
      error: 'Concurrent local update won conflict resolution',
    });
  });
});
