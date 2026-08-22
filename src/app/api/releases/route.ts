import { NextResponse } from 'next/server';
import { createReleaseSchema, reorderReleasesSchema } from '@/domain/story-map';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { validateRequest } from '@/lib/validations';
import { createRelease, reorderReleases } from '@/storymap/service';

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, reorderReleasesSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { error } = await reorderReleases(supabase, validation.data);

  if (error) {
    return serverErrorResponse('Failed to reorder releases', error);
  }
  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, createReleaseSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await createRelease(supabase, validation.data);

  if (error) {
    return serverErrorResponse('Failed to create release', error);
  }
  return NextResponse.json(data);
}
