import { NextResponse } from 'next/server';
import { moveStorySchema } from '@/domain/story-map';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';
import { moveStory } from '@/storymap/service';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, moveStorySchema);
  if (!validation.success) return validation.response;

  const supabase = auth.supabase;
  const { error } = await moveStory(supabase, id, validation.data);

  if (error) {
    return serverErrorResponse('Failed to move story', error);
  }

  return NextResponse.json({ success: true });
}
