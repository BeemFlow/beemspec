import { updateStoryMapSchema } from '@beemspec/storymap';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';
import { deleteStoryMap, getStoryMapGraph, updateStoryMap } from '@/storymap/service';
import type { StoryMapFull } from '@/types';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = await createClient();

  const { mapResult, activitiesResult, releasesResult } = await getStoryMapGraph(supabase, id);

  // Check main map first
  if (mapResult.error) {
    if (mapResult.error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Story map');
    }
    return serverErrorResponse('Failed to load story map', mapResult.error);
  }

  // Check related data
  if (activitiesResult.error) {
    return serverErrorResponse('Failed to load activities', activitiesResult.error);
  }
  if (releasesResult.error) {
    return serverErrorResponse('Failed to load releases', releasesResult.error);
  }
  const fullMap: StoryMapFull = {
    ...mapResult.data,
    activities: activitiesResult.data,
    releases: releasesResult.data,
  };

  return NextResponse.json(fullMap);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, updateStoryMapSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await updateStoryMap(supabase, id, validation.data);

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Story map');
    }
    return serverErrorResponse('Failed to update story map', error);
  }
  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = await createClient();
  const { data, error } = await deleteStoryMap(supabase, id);

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Story map');
    }
    return serverErrorResponse('Failed to delete story map', error);
  }
  return NextResponse.json({ success: true, deleted: data });
}
