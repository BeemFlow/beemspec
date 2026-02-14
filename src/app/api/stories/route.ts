import { NextResponse } from 'next/server';
import { domainRuntime } from '@/domains/runtime';
import { getLinearStorySyncTargetForTask } from '@/integrations/linear/settings';
import { upsertStoryLinearLink } from '@/integrations/linear/story-links';
import { syncNewStoryToLinear } from '@/integrations/linear/story-sync';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { createStorySchema, reorderStoriesSchema, validateRequest } from '@/lib/validations';

export async function PUT(request: Request) {
  const auth = await domainRuntime.storyMap.auth.requireAuth();
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
  const auth = await domainRuntime.storyMap.auth.requireAuth();
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

  if (!domainRuntime.storyMap.linearIssueSync) {
    return NextResponse.json(data);
  }

  try {
    const target = await getLinearStorySyncTargetForTask(supabase, data.task_id);
    const linearIssue = await syncNewStoryToLinear(data, domainRuntime.storyMap.linearIssueSync, target);
    if (!linearIssue) return NextResponse.json(data);

    try {
      await upsertStoryLinearLink(supabase, {
        storyId: data.id,
        linearIssueId: linearIssue.id,
        linearIssueIdentifier: linearIssue.identifier,
      });
    } catch (linkError) {
      // biome-ignore lint/suspicious/noConsole: best-effort link persistence
      console.error('Failed to persist story-linear link after story create sync', linkError);
    }

    return NextResponse.json({
      ...data,
      linear_issue: linearIssue,
    });
  } catch (syncError) {
    // biome-ignore lint/suspicious/noConsole: best-effort outbound sync
    console.error('Failed to sync new story to Linear', syncError);
    return NextResponse.json(data);
  }
}
