import { NextResponse } from 'next/server';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';
import { enqueueStoryLinearSyncJob, loadStoryWithStoryMap } from '@/orchestration/release-build';
import { runtime } from '@/runtime';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await runtime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const linearIssueSync = runtime.storyMap.linearIssueSync;
  if (!linearIssueSync) return NextResponse.json({ error: 'Linear integration is not enabled' }, { status: 503 });

  const { id: storyId } = await params;
  if (!isValidUuid(storyId)) return invalidIdResponse();

  const supabase = await createClient();
  const context = await loadStoryWithStoryMap(supabase, storyId);
  if (!context.ok) {
    if (context.reason === 'story_not_found') return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    if (context.reason === 'story_task_not_found') {
      return serverErrorResponse('Failed to resolve story task', context.error ?? new Error('Task not found'));
    }
    return serverErrorResponse(
      'Failed to resolve story map for story',
      context.error ?? new Error('Activity not found'),
    );
  }

  const { data: job, error: jobError } = await enqueueStoryLinearSyncJob(supabase, {
    storyMapId: context.data.storyMapId,
    storyId,
  });
  if (jobError || !job) {
    return serverErrorResponse('Failed to enqueue story linear sync job', jobError ?? new Error('Job not created'));
  }

  return NextResponse.json(
    {
      story_id: storyId,
      job_id: job.id,
      status: 'queued',
    },
    { status: 202 },
  );
}
