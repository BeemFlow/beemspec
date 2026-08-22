import { NextResponse } from 'next/server';
import { updatePersonaSchema } from '@/domain/story-map';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';
import { deletePersona, updatePersona } from '@/storymap/service';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, updatePersonaSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await updatePersona(supabase, id, validation.data);

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Persona');
    }
    return serverErrorResponse('Failed to update persona', error);
  }
  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = await createClient();
  const { data, error } = await deletePersona(supabase, id);

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Persona');
    }
    return serverErrorResponse('Failed to delete persona', error);
  }
  return NextResponse.json({ success: true, deleted: data });
}
