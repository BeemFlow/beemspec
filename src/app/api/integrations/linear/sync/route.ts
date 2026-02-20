import { NextResponse } from 'next/server';
import { resolveLinearSyncContextForStory } from '@/integrations/linear/auth';
import { getLinearIssueSync } from '@/integrations/linear/issue-sync';
import { linearSyncStorySchema } from '@/integrations/linear/schemas';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import { syncStoryToLinear } from '@/integrations/linear/story-sync';
import {
  buildStoryPatchFromLinearIssue,
  LINEAR_SYNC_DIRECTION,
  shouldApplyRemoteUpdate,
} from '@/integrations/linear/sync';
import type { LinearIssueSync } from '@/integrations/linear/types';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { validateRequest } from '@/lib/validations';

function ignored(reason: string): NextResponse {
  return NextResponse.json({ success: true, ignored: true, reason });
}

function isSuccessResponseStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

async function syncRemoteToLocal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  story: { id: string },
  remote: { id: string; identifier: string; title: string; description: string | null; updatedAt: string },
): Promise<NextResponse> {
  const patch = buildStoryPatchFromLinearIssue({
    title: remote.title,
    description: remote.description,
    stateName: null,
    updatedAt: remote.updatedAt,
  });

  // Build the DB update: scalar fields + merge content patch into existing content
  const dbUpdate: Record<string, unknown> = { updated_at: patch.updated_at };
  if (patch.title) dbUpdate.title = patch.title;
  if (patch.status) dbUpdate.status = patch.status;

  if (patch.content) {
    // Load current content to merge
    const { data: currentStory } = await supabase.from('stories').select('content').eq('id', story.id).single();
    const currentContent = (currentStory?.content as Record<string, unknown>) ?? {
      _version: 1,
      requirements: '',
      acceptance_criteria: '',
    };
    dbUpdate.content = { ...currentContent, ...patch.content };
  }

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

  return NextResponse.json({ success: true, direction: LINEAR_SYNC_DIRECTION.remoteToLocal, story_id: story.id });
}

async function syncLocalToRemote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  linearIssueSync: NonNullable<LinearIssueSync>,
  target: Parameters<typeof syncStoryToLinear>[3],
  story: Record<string, unknown>,
  link: { linearIssueId: string },
): Promise<NextResponse> {
  const synced = await syncStoryToLinear(story as never, linearIssueSync, link.linearIssueId, target);
  if (!synced) return ignored('sync did not produce a remote issue snapshot');

  await upsertStoryLinearLink(supabase, {
    storyId: story.id as string,
    linearIssueId: synced.id,
    linearIssueIdentifier: synced.identifier,
    lastLocalUpdatedAt: (story.updated_at as string | null) ?? null,
    lastLinearUpdatedAt: synced.updatedAt,
  });

  return NextResponse.json({ success: true, direction: LINEAR_SYNC_DIRECTION.localToRemote, story_id: story.id });
}

export async function syncStoryById(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  fallbackLinearIssueSync: LinearIssueSync | null;
  storyId: string;
}): Promise<NextResponse> {
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
    fallbackLinearIssueSync: input.fallbackLinearIssueSync,
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

export async function syncStoriesByIdList(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  fallbackLinearIssueSync: LinearIssueSync | null;
  storyIds: string[];
}): Promise<{
  considered: number;
  succeeded: number;
  failed: number;
  responses: Array<{ storyId: string; response: NextResponse }>;
}> {
  const responses: Array<{ storyId: string; response: NextResponse }> = [];
  let succeeded = 0;
  let failed = 0;

  for (const storyId of input.storyIds) {
    try {
      const response = await syncStoryById({
        supabase: input.supabase,
        fallbackLinearIssueSync: input.fallbackLinearIssueSync,
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

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, linearSyncStorySchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const summary = await syncStoriesByIdList({
    supabase,
    fallbackLinearIssueSync: getLinearIssueSync(),
    storyIds: [validation.data.story_id],
  });

  const single = summary.responses[0];
  if (!single) {
    return serverErrorResponse('Failed to sync story', new Error('No sync response returned'));
  }

  return single.response;
}
