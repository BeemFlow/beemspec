import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { createActivitySchema, reorderActivitiesSchema, validateRequest } from '@/lib/validations';

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, reorderActivitiesSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { error } = await supabase.rpc('reorder_activities', {
    p_story_map_id: validation.data.story_map_id,
    p_order: validation.data.order,
  });

  if (error) {
    return serverErrorResponse('Failed to reorder activities', error);
  }
  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, createActivitySchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('activities')
    .insert({
      story_map_id: validation.data.story_map_id,
      name: validation.data.name,
      description: validation.data.description ?? null,
    })
    .select()
    .single();

  if (error) {
    return serverErrorResponse('Failed to create activity', error);
  }
  return NextResponse.json(data);
}
