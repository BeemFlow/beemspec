import { NextResponse } from 'next/server';
import { domainRuntime } from '@/domains/runtime';
import { buildStoryPatchFromLinearIssue, shouldApplyRemoteUpdate } from '@/integrations/linear/reconcile';
import { getLinearStorySyncTargetForStory } from '@/integrations/linear/settings';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import { syncStoryToLinear } from '@/integrations/linear/story-sync';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { linearReconcileStorySchema, validateRequest } from '@/lib/validations';

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
  linearIssueSync: NonNullable<typeof domainRuntime.storyMap.linearIssueSync>,
  story: Record<string, unknown>,
  link: { linearIssueId: string },
): Promise<NextResponse> {
  const target = await getLinearStorySyncTargetForStory(supabase, story.id as string);
  if (!target) return ignored('no linear target configured for story team');

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

export async function POST(request: Request) {
  const auth = await domainRuntime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const linearIssueSync = domainRuntime.storyMap.linearIssueSync;
  if (!linearIssueSync) {
    return NextResponse.json({ error: 'Linear integration is not enabled' }, { status: 503 });
  }

  const validation = await validateRequest(request, linearReconcileStorySchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data: story, error: storyError } = await supabase
    .from('stories')
    .select('*')
    .eq('id', validation.data.story_id)
    .single();
  if (storyError) {
    if (storyError.code === DbErrorCode.NOT_FOUND) return notFoundResponse('Story');
    return serverErrorResponse('Failed to load story', storyError);
  }

  const link = await getStoryLinearLink(supabase, story.id);
  if (!link) return ignored('story is not linked to Linear');

  const remote = await linearIssueSync.getIssueById(link.linearIssueId);
  if (!remote) return ignored('linked Linear issue was not found');

  const localUpdatedAt = (story.updated_at as string | null) ?? null;
  if (shouldApplyRemoteUpdate(remote.updatedAt, localUpdatedAt)) {
    return reconcileRemoteToLocal(supabase, story, remote);
  }

  return reconcileLocalToRemote(supabase, linearIssueSync, story, link);
}
