import { NextResponse } from 'next/server';
import { createTaskSchema, reorderTasksSchema } from '@/domain/story-map';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { validateRequest } from '@/lib/validations';
import { createTask, reorderTasks } from '@/storymap/service';

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, reorderTasksSchema);
  if (!validation.success) return validation.response;

  const supabase = auth.supabase;
  const { error } = await reorderTasks(supabase, validation.data);

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

  const supabase = auth.supabase;
  const { data, error } = await createTask(supabase, validation.data);

  if (error) {
    return serverErrorResponse('Failed to create task', error);
  }
  return NextResponse.json(data);
}
