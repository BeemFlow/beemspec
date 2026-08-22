import { type LinearSyncContext, resolveLinearSyncContextForStoryMap } from '@/integrations/linear/auth';
import { shouldApplyRemoteUpdate } from '@/integrations/linear/conflict';
import { getStoryLinearLink } from '@/integrations/linear/story-links';
import { applyLinearIssueToStory, pushStoryToLinear } from '@/integrations/linear/story-sync';
import type { Supabase } from '@/lib/supabase/types';
import { loadStoryWithStoryMap } from '@/storymap/story-context';

export type LinearStorySyncAction = 'ignored' | 'created_remote' | 'local_to_remote' | 'remote_to_local' | 'failed';

export interface LinearStorySyncResult {
  storyId: string;
  success: boolean;
  action: LinearStorySyncAction;
  reason?: string;
  linearIssueId?: string;
}

function ignored(storyId: string, reason: string): LinearStorySyncResult {
  return { storyId, success: true, action: 'ignored', reason };
}

function unavailableReason(context: LinearSyncContext): string | null {
  if (!context.targetConfigured || !context.target) return 'no linear target configured for story team';
  if (context.linearIssueSync) return null;
  return context.status === 'auth_unavailable'
    ? 'Linear authorization is unavailable or expired'
    : 'Linear integration is not connected';
}

export async function reconcileStoryById(input: {
  supabase: Supabase;
  storyId: string;
  context?: LinearSyncContext;
}): Promise<LinearStorySyncResult> {
  const storyContext = await loadStoryWithStoryMap(input.supabase, input.storyId);
  if (!storyContext.ok) throw new Error(`Failed to load story: ${storyContext.reason}`);

  const context =
    input.context ??
    (await resolveLinearSyncContextForStoryMap(input.supabase, {
      storyMapId: storyContext.data.storyMapId,
    }));
  if (context.status === 'error') {
    throw new Error('Failed to resolve Linear sync context', { cause: context.error });
  }

  const unavailable = unavailableReason(context);
  if (unavailable) return ignored(input.storyId, unavailable);
  if (!context.target || !context.linearIssueSync) return ignored(input.storyId, 'Linear integration is not connected');

  const link = await getStoryLinearLink(input.supabase, input.storyId);
  if (!link) {
    const created = await pushStoryToLinear(input.supabase, {
      story: storyContext.data.story,
      storyMapId: storyContext.data.storyMapId,
      context,
      link: null,
    });
    return {
      storyId: input.storyId,
      success: true,
      action: 'created_remote',
      linearIssueId: created.id,
    };
  }

  const remote = await context.linearIssueSync.getIssueById(link.linearIssueId);
  if (!remote) return ignored(input.storyId, 'linked Linear issue was not found');

  if (shouldApplyRemoteUpdate(remote.updatedAt, storyContext.data.story.updated_at)) {
    const writeback = await applyLinearIssueToStory(input.supabase, {
      story: storyContext.data.story,
      issue: remote,
      target: context.target,
    });
    if (writeback.conflict) return ignored(input.storyId, 'concurrent local update won conflict resolution');
    if (writeback.ignoredReason) return ignored(input.storyId, 'remote issue has no supported fields for writeback');

    return {
      storyId: input.storyId,
      success: true,
      action: 'remote_to_local',
      linearIssueId: remote.id,
    };
  }

  const synced = await pushStoryToLinear(input.supabase, {
    story: storyContext.data.story,
    storyMapId: storyContext.data.storyMapId,
    context,
    link,
    remote,
  });
  return {
    storyId: input.storyId,
    success: true,
    action: 'local_to_remote',
    linearIssueId: synced.id,
  };
}

export async function reconcileStoriesForStoryMap(input: {
  supabase: Supabase;
  storyMapId: string;
  storyIds: string[];
}): Promise<{
  considered: number;
  succeeded: number;
  failed: number;
  ignored: number;
  createdRemote: number;
  localToRemote: number;
  remoteToLocal: number;
  results: LinearStorySyncResult[];
}> {
  const context = await resolveLinearSyncContextForStoryMap(input.supabase, { storyMapId: input.storyMapId });
  const concurrency = Math.min(4, Math.max(1, input.storyIds.length));
  const nextIndex = { value: 0 };
  const results = new Array<LinearStorySyncResult>(input.storyIds.length);

  async function worker() {
    while (nextIndex.value < input.storyIds.length) {
      const index = nextIndex.value;
      nextIndex.value += 1;
      const storyId = input.storyIds[index];

      try {
        results[index] = await reconcileStoryById({
          supabase: input.supabase,
          storyId,
          context,
        });
      } catch {
        results[index] = { storyId, success: false, action: 'failed', reason: 'sync failed' };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return {
    considered: input.storyIds.length,
    succeeded: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
    ignored: results.filter((result) => result.action === 'ignored').length,
    createdRemote: results.filter((result) => result.action === 'created_remote').length,
    localToRemote: results.filter((result) => result.action === 'local_to_remote').length,
    remoteToLocal: results.filter((result) => result.action === 'remote_to_local').length,
    results,
  };
}
