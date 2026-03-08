import { buildStoryPatchFromLinearIssue, mapStoryToLinearIssueInput } from '@beemspec/linear';
import { resolveLinearSyncContextForStory } from '@/integrations/linear/auth';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import {
  buildDbUpdateFromPatch,
  type IssueSync,
  SYNC_DIRECTION,
  shouldApplyRemoteUpdate,
  syncStoryToRemote,
} from '@/integrations/sync';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import type { Supabase } from '@/lib/supabase/types';

function ignored(reason: string): Response {
  return Response.json({ success: true, ignored: true, reason });
}

function isSuccessResponseStatus(status: number): boolean {
  return status >= 200 && status < 300;
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

  return Response.json({ success: true, direction: SYNC_DIRECTION.remoteToLocal, story_id: story.id });
}

async function syncLocalToRemote(
  supabase: Supabase,
  issueSync: NonNullable<IssueSync>,
  target: { teamId: string; projectId?: string; stateId?: string },
  story: Record<string, unknown>,
  link: { linearIssueId: string },
): Promise<Response> {
  const input = mapStoryToLinearIssueInput(story as never, target);
  const synced = await syncStoryToRemote(issueSync, input, link.linearIssueId);
  if (!synced) return ignored('sync did not produce a remote issue snapshot');

  await upsertStoryLinearLink(supabase, {
    storyId: story.id as string,
    linearIssueId: synced.id,
    linearIssueIdentifier: synced.identifier,
    lastLocalUpdatedAt: (story.updated_at as string | null) ?? null,
    lastLinearUpdatedAt: synced.updatedAt,
  });

  return Response.json({ success: true, direction: SYNC_DIRECTION.localToRemote, story_id: story.id });
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
  if (!linearSyncContext.targetConfigured || !linearSyncContext.target) {
    return ignored('no linear target configured for story team');
  }

  if (!linearSyncContext.linearIssueSync) {
    return ignored('Linear integration is not enabled');
  }

  const link = await getStoryLinearLink(input.supabase, story.id);
  if (!link) return ignored('story is not linked to Linear');

  const remote = await linearSyncContext.linearIssueSync.getIssueById(link.linearIssueId);
  if (!remote) return ignored('linked Linear issue was not found');

  const localUpdatedAt = (story.updated_at as string | null) ?? null;
  if (shouldApplyRemoteUpdate(remote.updatedAt, localUpdatedAt)) {
    return syncRemoteToLocal(input.supabase, story, remote);
  }

  return syncLocalToRemote(input.supabase, linearSyncContext.linearIssueSync, linearSyncContext.target, story, link);
}

export async function syncStoriesByIdList(input: { supabase: Supabase; storyIds: string[] }): Promise<{
  considered: number;
  succeeded: number;
  failed: number;
  responses: Array<{ storyId: string; response: Response }>;
}> {
  const responses: Array<{ storyId: string; response: Response }> = [];
  let succeeded = 0;
  let failed = 0;

  for (const storyId of input.storyIds) {
    try {
      const response = await syncStoryById({
        supabase: input.supabase,
        storyId,
      });
      responses.push({ storyId, response });

      if (isSuccessResponseStatus(response.status)) {
        succeeded += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      failed += 1;
      responses.push({
        storyId,
        response: serverErrorResponse('Failed to sync story', error),
      });
    }
  }

  return {
    considered: input.storyIds.length,
    succeeded,
    failed,
    responses,
  };
}
