import { createPersonaSchema } from '@beemspec/storymap';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { validateRequest } from '@/lib/validations';
import { createPersona } from '@/storymap/service';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, createPersonaSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await createPersona(supabase, validation.data);

  if (error) {
    return serverErrorResponse('Failed to create persona', error);
  }
  return NextResponse.json(data);
}
