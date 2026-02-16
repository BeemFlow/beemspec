import { NextResponse } from 'next/server';
import { loadStoryWithStoryMap, processStoryLinearSyncById } from '@/build-runs/processor';
import { isLinearSyncAvailableForStoryMap } from '@/integrations/linear/auth';
import { getLinearIssueSync } from '@/integrations/linear/issue-sync';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { createStorySchema, reorderStoriesSchema, validateRequest } from '@/lib/validations';

export async function PUT(request: Request) {
  const auth = await requireAuth();
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
  const auth = await requireAuth();
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
      fallbackLinearIssueSync: getLinearIssueSync(),
    });
    if (!linearSyncEnabled) return NextResponse.json(data);

    const linearIssue = await processStoryLinearSyncById(supabase, {
      storyId: data.id,
      linearIssueSync: getLinearIssueSync(),
    });

    return NextResponse.json({
      ...data,
      linear_sync: {
        status: 'synced',
        linear_issue_id: linearIssue.id,
        linear_issue_identifier: linearIssue.identifier,
      },
    });
  } catch (syncError) {
    // biome-ignore lint/suspicious/noConsole: best-effort outbound sync for story creation
    console.error('Failed to sync story to Linear', syncError);
    return NextResponse.json(data);
  }
}
