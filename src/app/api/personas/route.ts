import { NextResponse } from 'next/server';
import { createPersonaSchema } from '@/domain/story-map';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { validateRequest } from '@/lib/validations';
import { createPersona } from '@/storymap/service';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, createPersonaSchema);
  if (!validation.success) return validation.response;

  const supabase = auth.supabase;
  const { data, error } = await createPersona(supabase, validation.data);

  if (error) {
    return serverErrorResponse('Failed to create persona', error);
  }
  return NextResponse.json(data);
}
