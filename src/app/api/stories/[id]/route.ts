import { updateStorySchema } from '@beemspec/storymap';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { deleteE2EStory, updateE2EStory } from '@/lib/e2e/processflow-store';
import { env } from '@/lib/env';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';
import { deleteStory, getStory, updateStory } from '@/storymap/service';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (env.e2eTestMode()) {
    return notFoundResponse('Story');
  }

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
  if (env.e2eTestMode()) {
    const { id } = await params;
    const validation = await validateRequest(request, updateStorySchema);
    if (!validation.success) return validation.response;
    const story = updateE2EStory(id, validation.data);
    return story ? NextResponse.json(story) : notFoundResponse('Story');
  }

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

  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (env.e2eTestMode()) {
    const { id } = await params;
    const story = deleteE2EStory(id);
    return story ? NextResponse.json({ success: true, deleted: story }) : notFoundResponse('Story');
  }

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
  return NextResponse.json({ success: true, deleted: data });
}
