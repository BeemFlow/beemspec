import { NextResponse } from 'next/server';
import { updateStorySchema } from '@/domain/story-map';
import { scheduleLinearSyncWorker } from '@/integrations/linear/schedule';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';
import { deleteStory, getStory, updateStory } from '@/storymap/service';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = await createClient();
  const { data, error } = await getStory(supabase, id);

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Story');
    }
    return serverErrorResponse('Failed to load story', error);
  }
  return NextResponse.json(data);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, updateStorySchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await updateStory(supabase, id, validation.data);

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Story');
    }
    return serverErrorResponse('Failed to update story', error);
  }

  scheduleLinearSyncWorker();

  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = await createClient();
  const { data, error } = await deleteStory(supabase, id);

  if (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : null;
    if (code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Story');
    }
    return serverErrorResponse('Failed to delete story', error);
  }
  scheduleLinearSyncWorker();
  return NextResponse.json({ success: true, deleted: data });
}
