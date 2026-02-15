import { NextResponse } from 'next/server';
import { domainRuntime } from '@/domains/runtime';
import { getLinearStorySyncTargetForStoryMap } from '@/integrations/linear/settings';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import { syncStoryToLinear } from '@/integrations/linear/story-sync';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await domainRuntime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const linearIssueSync = domainRuntime.storyMap.linearIssueSync;
  if (!linearIssueSync) return NextResponse.json({ error: 'Linear integration is not enabled' }, { status: 503 });

  const { id: storyId } = await params;
  if (!isValidUuid(storyId)) return invalidIdResponse();

  const supabase = await createClient();
  const { data: story, error: storyError } = await supabase.from('stories').select('*').eq('id', storyId).single();
  if (storyError || !story) return NextResponse.json({ error: 'Story not found' }, { status: 404 });

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('activity_id')
    .eq('id', story.task_id)
    .single();
  if (taskError || !task)
    return serverErrorResponse('Failed to resolve story task', taskError ?? new Error('Task not found'));

  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .select('story_map_id')
    .eq('id', task.activity_id)
    .single();
  if (activityError || !activity) {
    return serverErrorResponse(
      'Failed to resolve story map for story',
      activityError ?? new Error('Activity not found'),
    );
  }

  const target = await getLinearStorySyncTargetForStoryMap(supabase, activity.story_map_id);
  if (!target) return NextResponse.json({ error: 'No linear target configured for story map team' }, { status: 400 });

  const existingLink = await getStoryLinearLink(supabase, storyId);
  const linearIssue = await syncStoryToLinear(story, linearIssueSync, existingLink?.linearIssueId ?? null, target);
  if (!linearIssue) return NextResponse.json({ error: 'Linear sync returned no issue snapshot' }, { status: 502 });

  await upsertStoryLinearLink(supabase, {
    storyId,
    linearIssueId: linearIssue.id,
    linearIssueIdentifier: linearIssue.identifier,
    lastLocalUpdatedAt: story.updated_at ?? null,
    lastLinearUpdatedAt: linearIssue.updatedAt,
  });

  return NextResponse.json({
    story_id: storyId,
    linear_issue_id: linearIssue.id,
    linear_issue_identifier: linearIssue.identifier,
  });
}
