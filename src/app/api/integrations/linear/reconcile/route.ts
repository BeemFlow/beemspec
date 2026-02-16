import { NextResponse } from 'next/server';
import { resolveLinearSyncContextForStory } from '@/integrations/linear/auth';
import { buildStoryPatchFromLinearIssue, shouldApplyRemoteUpdate } from '@/integrations/linear/reconcile';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import { syncStoryToLinear } from '@/integrations/linear/story-sync';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { linearReconcileStorySchema, validateRequest } from '@/lib/validations';
import { runtime } from '@/runtime';

function ignored(reason: string): NextResponse {
  return NextResponse.json({ success: true, ignored: true, reason });
}

async function reconcileRemoteToLocal(
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
  const { error: updateError } = await supabase.from('stories').update(patch).eq('id', story.id);
  if (updateError) {
    return serverErrorResponse('Failed to apply remote reconciliation update', updateError);
  }

  await upsertStoryLinearLink(supabase, {
    storyId: story.id,
    linearIssueId: remote.id,
    linearIssueIdentifier: remote.identifier,
    lastLocalUpdatedAt: remote.updatedAt,
    lastLinearUpdatedAt: remote.updatedAt,
  });

  return NextResponse.json({ success: true, direction: 'remote_to_local', story_id: story.id });
}

async function reconcileLocalToRemote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  linearIssueSync: NonNullable<typeof runtime.storyMap.linearIssueSync>,
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

  return NextResponse.json({ success: true, direction: 'local_to_remote', story_id: story.id });
}

export async function reconcileStoryById(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  fallbackLinearIssueSync: typeof runtime.storyMap.linearIssueSync;
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
    return reconcileRemoteToLocal(input.supabase, story, remote);
  }

  return reconcileLocalToRemote(
    input.supabase,
    linearSyncContext.linearIssueSync,
    linearSyncContext.target,
    story,
    link,
  );
}

export async function POST(request: Request) {
  const auth = await runtime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, linearReconcileStorySchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  return reconcileStoryById({
    supabase,
    fallbackLinearIssueSync: runtime.storyMap.linearIssueSync,
    storyId: validation.data.story_id,
  });
}
