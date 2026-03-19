import { updateReleaseSchema } from '@beemspec/storymap';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { deleteE2ERelease, updateE2ERelease } from '@/lib/e2e/test-store';
import { env } from '@/lib/env';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';
import { deleteRelease, updateRelease } from '@/storymap/service';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (env.e2eTestMode()) {
    const { id } = await params;
    const validation = await validateRequest(request, updateReleaseSchema);
    if (!validation.success) return validation.response;
    const release = updateE2ERelease(id, validation.data);
    return release ? NextResponse.json(release) : notFoundResponse('Release');
  }

  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, updateReleaseSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await updateRelease(supabase, id, validation.data);

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Release');
    }
    return serverErrorResponse('Failed to update release', error);
  }
  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (env.e2eTestMode()) {
    const { id } = await params;
    const release = deleteE2ERelease(id);
    return release ? NextResponse.json({ success: true, deleted: release }) : notFoundResponse('Release');
  }

  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = await createClient();
  const { data, error } = await deleteRelease(supabase, id);

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Release');
    }
    return serverErrorResponse('Failed to delete release', error);
  }
  return NextResponse.json({ success: true, deleted: data });
}
