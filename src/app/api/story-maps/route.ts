import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { createStoryMapSchema, validateRequest } from '@/lib/validations';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('team_id');

  if (!teamId) {
    return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('story_maps')
    .select('*')
    .eq('team_id', teamId)
    .order('updated_at', { ascending: false });

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
  const { data, error } = await supabase
    .from('story_maps')
    .insert({
      team_id: validation.data.team_id,
      name: validation.data.name,
      description: validation.data.description ?? null,
    })
    .select()
    .single();

  if (error) {
    return serverErrorResponse('Failed to create story map', error);
  }
  return NextResponse.json(data);
}
