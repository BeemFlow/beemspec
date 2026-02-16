import { NextResponse } from 'next/server';
import { loadStoryWithStoryMap } from '@/build-runs/processor';
import { enqueueStoryLinearSyncJob } from '@/build-runs/queue';
import { isLinearSyncAvailableForStoryMap } from '@/integrations/linear/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { createStorySchema, reorderStoriesSchema, validateRequest } from '@/lib/validations';
import { runtime } from '@/runtime';

export async function PUT(request: Request) {
  const auth = await runtime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, reorderStoriesSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { error } = await supabase.rpc('reorder_stories', {
    p_task_id: validation.data.task_id,
    p_release_id: validation.data.release_id,
    p_order: validation.data.order,
  });

  if (error) {
    return serverErrorResponse('Failed to reorder stories', error);
  }
  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  const auth = await runtime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, createStorySchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('stories')
    .insert({
      task_id: validation.data.task_id,
      release_id: validation.data.release_id ?? null,
      title: validation.data.title,
      requirements: validation.data.requirements,
      acceptance_criteria: validation.data.acceptance_criteria,
      figma_link: validation.data.figma_link ?? null,
      edge_cases: validation.data.edge_cases ?? null,
      technical_guidelines: validation.data.technical_guidelines ?? null,
      status: validation.data.status,
    })
    .select()
    .single();

  if (error) {
    return serverErrorResponse('Failed to create story', error);
  }

  try {
    const context = await loadStoryWithStoryMap(supabase, data.id);
    if (!context.ok) return NextResponse.json(data);

    const linearSyncEnabled = await isLinearSyncAvailableForStoryMap(supabase, {
      storyMapId: context.data.storyMapId,
      fallbackLinearIssueSync: runtime.storyMap.linearIssueSync,
    });
    if (!linearSyncEnabled) return NextResponse.json(data);

    const { data: job } = await enqueueStoryLinearSyncJob(supabase, {
      storyMapId: context.data.storyMapId,
      storyId: data.id,
    });
    if (!job) return NextResponse.json(data);

    return NextResponse.json({ ...data, linear_sync: { status: 'queued', job_id: job.id } });
  } catch (queueError) {
    // biome-ignore lint/suspicious/noConsole: best-effort outbound sync enqueue
    console.error('Failed to enqueue story sync to Linear', queueError);
    return NextResponse.json(data);
  }
}
