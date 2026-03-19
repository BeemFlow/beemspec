import { createActivitySchema, reorderActivitiesSchema } from '@beemspec/storymap';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createE2EActivity } from '@/lib/e2e/test-store';
import { env } from '@/lib/env';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { validateRequest } from '@/lib/validations';
import { createActivity, reorderActivities } from '@/storymap/service';

export async function PUT(request: Request) {
  if (env.e2eTestMode()) {
    return NextResponse.json({ success: true });
  }

  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, reorderActivitiesSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { error } = await reorderActivities(supabase, validation.data);

  if (error) {
    return serverErrorResponse('Failed to reorder activities', error);
  }
  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  if (env.e2eTestMode()) {
    const body = (await request.json()) as { story_map_id?: string; name?: string; description?: string | null };
    if (!body.story_map_id || !body.name?.trim()) {
      return NextResponse.json({ error: 'story_map_id and name are required' }, { status: 400 });
    }
    const activity = createE2EActivity({
      story_map_id: body.story_map_id,
      name: body.name.trim(),
      description: body.description ?? null,
    });
    return activity
      ? NextResponse.json(activity)
      : NextResponse.json({ error: 'Story map not found' }, { status: 404 });
  }

  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, createActivitySchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await createActivity(supabase, validation.data);

  if (error) {
    return serverErrorResponse('Failed to create activity', error);
  }
  return NextResponse.json(data);
}
