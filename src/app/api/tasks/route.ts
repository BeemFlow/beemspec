import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { createTaskSchema, reorderTasksSchema, validateRequest } from '@/lib/validations';

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, reorderTasksSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { error } = await supabase.rpc('reorder_tasks', {
    p_activity_id: validation.data.activity_id,
    p_order: validation.data.order,
  });

  if (error) {
    return serverErrorResponse('Failed to reorder tasks', error);
  }
  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, createTaskSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      activity_id: validation.data.activity_id,
      name: validation.data.name,
      description: validation.data.description ?? null,
    })
    .select()
    .single();

  if (error) {
    return serverErrorResponse('Failed to create task', error);
  }
  return NextResponse.json(data);
}
