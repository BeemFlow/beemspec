import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStory, deleteStory, updateStory } from '@/storymap/service';
import { createLocalSupabaseAdminClient, createLocalSupabasePublicClient } from '@/test/local-supabase';

const admin = createLocalSupabaseAdminClient();
const member = createLocalSupabasePublicClient();
const ids = {
  team: crypto.randomUUID(),
  map: crypto.randomUUID(),
  activity: crypto.randomUUID(),
  task: crypto.randomUUID(),
  story: crypto.randomUUID(),
};
let userId = '';

async function mustSucceed(resultPromise: PromiseLike<{ error: unknown }>, message: string) {
  const result = await resultPromise;
  if (result.error) throw new Error(`${message}: ${JSON.stringify(result.error)}`);
}

async function claimOne() {
  return admin
    .rpc('claim_linear_sync_jobs', { p_limit: 1, p_visibility_timeout: 60 })
    .single<{ message_id: number; read_count: number; payload: Record<string, unknown> }>();
}

async function deleteMessage(messageId: number) {
  await mustSucceed(admin.rpc('delete_linear_sync_job', { p_message_id: messageId }), 'Failed to delete queue message');
}

describe.sequential('durable Linear sync database integration', () => {
  beforeAll(async () => {
    const email = `linear-queue-${crypto.randomUUID()}@example.com`;
    const password = `local-${crypto.randomUUID()}`;
    const createdUser = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (createdUser.error || !createdUser.data.user) throw createdUser.error ?? new Error('Failed to create user');
    userId = createdUser.data.user.id;

    await mustSucceed(admin.from('teams').insert({ id: ids.team, name: 'Linear Queue Team' }), 'Failed to create team');
    await mustSucceed(
      admin.from('team_members').insert({ team_id: ids.team, user_id: userId, role: 'owner' }),
      'Failed to create member',
    );
    await mustSucceed(
      admin.from('story_maps').insert({ id: ids.map, team_id: ids.team, name: 'Linear Queue Map' }),
      'Failed to create story map',
    );
    await mustSucceed(
      admin.from('activities').insert({ id: ids.activity, story_map_id: ids.map, name: 'Activity' }),
      'Failed to create activity',
    );
    await mustSucceed(
      admin.from('tasks').insert({ id: ids.task, activity_id: ids.activity, name: 'Task' }),
      'Failed to create task',
    );
    await mustSucceed(
      admin.from('integration_settings').insert({ team_id: ids.team, linear_team_id: 'linear-team' }),
      'Failed to create team settings',
    );
    await mustSucceed(
      admin
        .from('story_map_integration_settings')
        .insert({ team_id: ids.team, story_map_id: ids.map, linear_project_id: 'linear-project' }),
      'Failed to create map settings',
    );
    await mustSucceed(
      admin.from('linear_oauth_connections').insert({ team_id: ids.team, access_token: 'local-placeholder' }),
      'Failed to create connection',
    );

    const signedIn = await member.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
  });

  afterAll(async () => {
    await member.auth.signOut();
    await admin.from('integration_sync_state').delete().eq('team_id', ids.team);
    await admin.from('teams').delete().eq('id', ids.team);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it('atomically enqueues authenticated story creates and mutable updates', async () => {
    const created = await createStory(member as never, {
      task_id: ids.task,
      title: 'Queued story',
      status: 'backlog',
      content: { _version: 1, user_story: 'Queued', acceptance_criteria: 'Delivered' },
    });
    expect(created.error).toBeNull();
    ids.story = created.data?.id ?? ids.story;

    const createdState = await admin
      .from('integration_sync_state')
      .select('operation, desired_version, status')
      .eq('entity_id', ids.story)
      .single();
    expect(createdState.data).toMatchObject({ operation: 'upsert', status: 'pending' });

    const firstMessage = await claimOne();
    expect(firstMessage.error).toBeNull();
    expect(firstMessage.data?.payload).toMatchObject({
      entity_id: ids.story,
      operation: 'upsert',
      desired_version: createdState.data?.desired_version,
    });
    await deleteMessage(firstMessage.data?.message_id ?? 0);

    const updated = await updateStory(member as never, ids.story, { title: 'Queued story v2' });
    expect(updated.error).toBeNull();

    const updatedMessage = await claimOne();
    expect(updatedMessage.data?.payload).toMatchObject({ entity_id: ids.story, operation: 'upsert' });
    expect(updatedMessage.data?.payload.desired_version).not.toBe(createdState.data?.desired_version);
    await deleteMessage(updatedMessage.data?.message_id ?? 0);
  });

  it('captures remote delete intent before the local link cascades away', async () => {
    await mustSucceed(
      admin.from('story_linear_links').insert({
        story_id: ids.story,
        linear_issue_id: 'linear-delete-issue',
        linear_issue_identifier: 'BEE-99',
      }),
      'Failed to create story link',
    );

    const deleted = await deleteStory(member as never, ids.story);
    expect(deleted.error).toBeNull();
    expect((deleted.data as { id?: string } | null)?.id).toBe(ids.story);

    const [story, state, message] = await Promise.all([
      admin.from('stories').select('id').eq('id', ids.story).maybeSingle(),
      admin.from('integration_sync_state').select('operation, remote_id, status').eq('entity_id', ids.story).single(),
      claimOne(),
    ]);
    expect(story.data).toBeNull();
    expect(state.data).toMatchObject({ operation: 'delete', remote_id: 'linear-delete-issue', status: 'pending' });
    expect(message.data?.payload).toMatchObject({
      entity_id: ids.story,
      operation: 'delete',
      remote_id: 'linear-delete-issue',
      team_id: ids.team,
    });
    await deleteMessage(message.data?.message_id ?? 0);
  });

  it('uses the deterministic issue id when deletion races a missing link write', async () => {
    const created = await createStory(member as never, {
      task_id: ids.task,
      title: 'Deleted before link write',
      status: 'todo',
      content: { _version: 1, user_story: 'Create then delete', acceptance_criteria: 'No orphan' },
    });
    expect(created.error).toBeNull();
    const storyId = created.data?.id as string;

    const createMessage = await claimOne();
    await deleteMessage(createMessage.data?.message_id ?? 0);

    const deleted = await deleteStory(member as never, storyId);
    expect(deleted.error).toBeNull();

    const [state, deleteJob] = await Promise.all([
      admin.from('integration_sync_state').select('operation, remote_id, status').eq('entity_id', storyId).single(),
      claimOne(),
    ]);
    expect(state.data).toMatchObject({ operation: 'delete', remote_id: storyId, status: 'pending' });
    expect(deleteJob.data?.payload).toMatchObject({
      entity_id: storyId,
      operation: 'delete',
      remote_id: storyId,
    });
    await deleteMessage(deleteJob.data?.message_id ?? 0);
  });

  it('prunes expired webhook receipts and completed orphan sync state', async () => {
    const oldProcessedKey = `old-processed-${crypto.randomUUID()}`;
    const oldFailedKey = `old-failed-${crypto.randomUUID()}`;
    const recentFailedKey = `recent-failed-${crypto.randomUUID()}`;
    const orphanStoryId = crypto.randomUUID();
    const now = Date.now();

    await mustSucceed(
      admin.from('integration_webhook_receipts').insert([
        {
          provider: 'linear',
          idempotency_key: oldProcessedKey,
          status: 'processed',
          processed_at: new Date(now - 31 * 86_400_000).toISOString(),
        },
        {
          provider: 'linear',
          idempotency_key: oldFailedKey,
          status: 'failed',
          processed_at: new Date(now - 91 * 86_400_000).toISOString(),
        },
        {
          provider: 'linear',
          idempotency_key: recentFailedKey,
          status: 'failed',
          processed_at: new Date(now - 89 * 86_400_000).toISOString(),
        },
      ]),
      'Failed to seed webhook receipts',
    );
    await mustSucceed(
      admin.from('integration_sync_state').insert({
        provider: 'linear',
        entity_type: 'story',
        entity_id: orphanStoryId,
        team_id: ids.team,
        operation: 'delete',
        desired_version: new Date(now - 31 * 86_400_000).toISOString(),
        status: 'synced',
      }),
      'Failed to seed orphan sync state',
    );

    const cleanup = await admin
      .rpc('prune_integration_history', {
        p_processed_receipt_days: 30,
        p_failed_receipt_days: 90,
      })
      .single<{ webhook_receipts_deleted: number; orphan_sync_states_deleted: number }>();
    expect(cleanup.error).toBeNull();
    expect(cleanup.data).toEqual({ webhook_receipts_deleted: 2, orphan_sync_states_deleted: 1 });

    const receipts = await admin
      .from('integration_webhook_receipts')
      .select('idempotency_key')
      .in('idempotency_key', [oldProcessedKey, oldFailedKey, recentFailedKey]);
    expect(receipts.data).toEqual([{ idempotency_key: recentFailedKey }]);
  });
});
