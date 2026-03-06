import { createStoryMapSchema } from '@beemspec/storymap';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { validateRequest } from '@/lib/validations';
import { createStoryMap, listStoryMaps } from '@/storymap/service';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('team_id');

  if (!teamId) {
    return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await listStoryMaps(supabase, teamId);

  if (error) {
    return serverErrorResponse('Failed to load story maps', error);
  }
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, createStoryMapSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await createStoryMap(supabase, validation.data);

  if (error) {
    return serverErrorResponse('Failed to create story map', error);
  }
  return NextResponse.json(data);
}
