import { buildStoryPatchFromLinearIssue, mapStoryToLinearIssueInput } from '@beemspec/linear';
import {
  buildDbUpdateFromPatch,
  type IssueSync,
  SYNC_DIRECTION,
  shouldApplyRemoteUpdate,
  syncStoryToRemote,
} from '@beemspec/sync';
import { resolveLinearSyncContextForStory } from '@/integrations/linear/auth';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import { maybeSyncStoryToLinear } from '@/integrations/linear/sync';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import type { Supabase } from '@/lib/supabase/types';

function ignored(reason: string): Response {
  return Response.json({ success: true, ignored: true, reason });
}

function isSuccessResponseStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

type SyncAction = 'ignored' | 'created_remote' | 'local_to_remote' | 'remote_to_local';

interface SyncResponsePayload {
  success: boolean;
  ignored?: boolean;
  reason?: string;
  direction?: typeof SYNC_DIRECTION.localToRemote | typeof SYNC_DIRECTION.remoteToLocal;
  story_id?: string;
  linear_issue_id?: string;
  action?: SyncAction;
}

async function readSyncResponsePayload(response: Response): Promise<SyncResponsePayload | null> {
  try {
    return (await response.clone().json()) as SyncResponsePayload;
  } catch {
    return null;
  }
}

async function syncRemoteToLocal(
  supabase: Supabase,
  story: { id: string },
  remote: { id: string; identifier: string; title: string; description: string | null; updatedAt: string },
): Promise<Response> {
  const patch = buildStoryPatchFromLinearIssue({
    title: remote.title,
    description: remote.description,
    stateName: null,
    updatedAt: remote.updatedAt,
  });

  let currentContent = null;
  if (patch.content) {
    const { data: currentStory } = await supabase.from('stories').select('content').eq('id', story.id).single();
    currentContent = currentStory?.content ?? null;
  }
  const dbUpdate = buildDbUpdateFromPatch(patch, currentContent);

  const { error: updateError } = await supabase.from('stories').update(dbUpdate).eq('id', story.id);
  if (updateError) {
    return serverErrorResponse('Failed to apply remote sync update', updateError);
  }

  await upsertStoryLinearLink(supabase, {
    storyId: story.id,
    linearIssueId: remote.id,
    linearIssueIdentifier: remote.identifier,
    lastLocalUpdatedAt: remote.updatedAt,
    lastLinearUpdatedAt: remote.updatedAt,
  });

  return Response.json({
    success: true,
    direction: SYNC_DIRECTION.remoteToLocal,
    story_id: story.id,
    linear_issue_id: remote.id,
    action: 'remote_to_local',
  });
}

async function syncLocalToRemote(
  supabase: Supabase,
  issueSync: NonNullable<IssueSync>,
  target: { teamId: string; projectId?: string; stateId?: string },
  story: Record<string, unknown>,
  link: { linearIssueId: string },
  options: { preserveFromDescription?: string | null } = {},
): Promise<Response> {
  const input = mapStoryToLinearIssueInput(story as never, target, options);
  const synced = await syncStoryToRemote(issueSync, input, link.linearIssueId);
  if (!synced) return ignored('sync did not produce a remote issue snapshot');

  await upsertStoryLinearLink(supabase, {
    storyId: story.id as string,
    linearIssueId: synced.id,
    linearIssueIdentifier: synced.identifier,
    lastLocalUpdatedAt: (story.updated_at as string | null) ?? null,
    lastLinearUpdatedAt: synced.updatedAt,
  });

  return Response.json({
    success: true,
    direction: SYNC_DIRECTION.localToRemote,
    story_id: story.id,
    linear_issue_id: synced.id,
    action: 'local_to_remote',
  });
}

export async function syncStoryById(input: { supabase: Supabase; storyId: string }): Promise<Response> {
  const { data: story, error: storyError } = await input.supabase
    .from('stories')
    .select('*')
    .eq('id', input.storyId)
    .single();
  if (storyError) {
    if (storyError.code === DbErrorCode.NOT_FOUND) return notFoundResponse('Story');
    return serverErrorResponse('Failed to load story', storyError);
  }

  const linearSyncContext = await resolveLinearSyncContextForStory(input.supabase, {
    storyId: input.storyId,
  });
  if (linearSyncContext.status === 'error') {
    return serverErrorResponse('Failed to resolve Linear sync context', linearSyncContext.error);
  }
  if (!linearSyncContext.targetConfigured || !linearSyncContext.target) {
    return ignored('no linear target configured for story team');
  }

  if (!linearSyncContext.linearIssueSync) {
    return ignored(
      linearSyncContext.status === 'auth_unavailable'
        ? 'Linear authorization is unavailable or expired'
        : 'Linear integration is not connected',
    );
  }

  const link = await getStoryLinearLink(input.supabase, story.id);
  if (!link) {
    const created = await maybeSyncStoryToLinear(input.supabase, story.id);
    if (!created) return ignored('story is not linked and could not be created in Linear');

    return Response.json({
      success: true,
      direction: SYNC_DIRECTION.localToRemote,
      story_id: story.id,
      linear_issue_id: created.id,
      action: 'created_remote',
    });
  }

  const remote = await linearSyncContext.linearIssueSync.getIssueById(link.linearIssueId);
  if (!remote) return ignored('linked Linear issue was not found');

  const localUpdatedAt = (story.updated_at as string | null) ?? null;
  if (shouldApplyRemoteUpdate(remote.updatedAt, localUpdatedAt)) {
    return syncRemoteToLocal(input.supabase, story, remote);
  }

  return syncLocalToRemote(input.supabase, linearSyncContext.linearIssueSync, linearSyncContext.target, story, link, {
    preserveFromDescription: remote.description,
  });
}

export async function syncStoriesByIdList(input: { supabase: Supabase; storyIds: string[] }): Promise<{
  considered: number;
  succeeded: number;
  failed: number;
  ignored: number;
  createdRemote: number;
  localToRemote: number;
  remoteToLocal: number;
  responses: Array<{ storyId: string; response: Response }>;
}> {
  const concurrency = Math.min(4, Math.max(1, input.storyIds.length));
  const nextIndex = { value: 0 };
  const responses = new Array<{ storyId: string; response: Response }>(input.storyIds.length);

  async function worker() {
    while (nextIndex.value < input.storyIds.length) {
      const index = nextIndex.value;
      nextIndex.value += 1;
      const storyId = input.storyIds[index];

      try {
        responses[index] = {
          storyId,
          response: await syncStoryById({ supabase: input.supabase, storyId }),
        };
      } catch (error) {
        responses[index] = {
          storyId,
          response: serverErrorResponse('Failed to sync story', error),
        };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  let succeeded = 0;
  let failed = 0;
  let ignored = 0;
  let createdRemote = 0;
  let localToRemote = 0;
  let remoteToLocal = 0;

  for (const { response } of responses) {
    if (isSuccessResponseStatus(response.status)) {
      succeeded += 1;
      const payload = await readSyncResponsePayload(response);
      if (payload?.ignored) ignored += 1;
      if (payload?.action === 'created_remote') createdRemote += 1;
      if (payload?.action === 'local_to_remote') localToRemote += 1;
      if (payload?.action === 'remote_to_local') remoteToLocal += 1;
    } else {
      failed += 1;
    }
  }

  return {
    considered: input.storyIds.length,
    succeeded,
    failed,
    ignored,
    createdRemote,
    localToRemote,
    remoteToLocal,
    responses,
  };
}
