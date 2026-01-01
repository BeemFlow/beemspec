import { NextResponse } from 'next/server';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { createStorySchema, reorderStoriesSchema, validateRequest } from '@/lib/validations';

export async function PUT(request: Request) {
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
  return NextResponse.json(data);
}
