import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { createPersonaSchema, validateRequest } from '@/lib/validations';

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, createPersonaSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('personas')
    .insert({
      story_map_id: validation.data.story_map_id,
      name: validation.data.name,
      description: validation.data.description ?? null,
      goals: validation.data.goals ?? null,
    })
    .select()
    .single();

  if (error) {
    return serverErrorResponse('Failed to create persona', error);
  }
  return NextResponse.json(data);
}
