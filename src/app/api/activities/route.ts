import { NextResponse } from 'next/server';
import { createActivitySchema, reorderActivitiesSchema } from '@/domain/story-map';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { validateRequest } from '@/lib/validations';
import { createActivity, reorderActivities } from '@/storymap/service';

export async function PUT(request: Request) {
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
