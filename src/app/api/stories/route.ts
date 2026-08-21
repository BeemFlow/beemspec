import { createStorySchema, reorderStoriesSchema } from '@beemspec/storymap';
import { NextResponse } from 'next/server';
import { scheduleLinearSyncDrain } from '@/integrations/linear/schedule';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { validateRequest } from '@/lib/validations';
import { createStory, reorderStories } from '@/storymap/service';

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, reorderStoriesSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { error } = await reorderStories(supabase, validation.data);

  if (error) {
    return serverErrorResponse('Failed to reorder stories', error);
  }
  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, createStorySchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await createStory(supabase, validation.data);

  if (error) {
    return serverErrorResponse('Failed to create story', error);
  }

  scheduleLinearSyncDrain();

  return NextResponse.json(data);
}
