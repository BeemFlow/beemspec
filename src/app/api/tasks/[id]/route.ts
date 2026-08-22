import { NextResponse } from 'next/server';
import { updateTaskSchema } from '@/domain/story-map';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';
import { deleteTask, updateTask } from '@/storymap/service';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, updateTaskSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await updateTask(supabase, id, validation.data);

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Task');
    }
    return serverErrorResponse('Failed to update task', error);
  }
  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = await createClient();
  const { data, error } = await deleteTask(supabase, id);

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Task');
    }
    return serverErrorResponse('Failed to delete task', error);
  }
  return NextResponse.json({ success: true, deleted: data });
}
