import { NextResponse } from 'next/server';
import { updateStorySchema } from '@/app/api/story-maps/schemas';
import { loadStoryWithStoryMap } from '@/build-runs/processor';
import { isLinearSyncAvailableForStoryMap } from '@/integrations/linear/auth';
import { getLinearIssueSync } from '@/integrations/linear/issue-sync';
import { processStoryLinearSyncById } from '@/integrations/linear/sync-story-by-id';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid, pickDefined, validateRequest } from '@/lib/validations';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = await createClient();
  const { data, error } = await supabase.from('stories').select('*').eq('id', id).single();

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Story');
    }
    return serverErrorResponse('Failed to load story', error);
  }
  return NextResponse.json(data);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const linearIssueSync = getLinearIssueSync();

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, updateStorySchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const updateData = {
    ...pickDefined(validation.data),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('stories').update(updateData).eq('id', id).select().single();

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Story');
    }
    return serverErrorResponse('Failed to update story', error);
  }

  try {
    const context = await loadStoryWithStoryMap(supabase, data.id);
    if (!context.ok) return NextResponse.json(data);

    const linearSyncEnabled = await isLinearSyncAvailableForStoryMap(supabase, {
      storyMapId: context.data.storyMapId,
      fallbackLinearIssueSync: linearIssueSync,
    });
    if (!linearSyncEnabled) return NextResponse.json(data);

    const linearIssue = await processStoryLinearSyncById(supabase, {
      storyId: data.id,
      linearIssueSync,
    });

    return NextResponse.json({
      ...data,
      linear_sync: {
        status: 'synced',
        linear_issue_id: linearIssue.id,
        linear_issue_identifier: linearIssue.identifier,
      },
    });
  } catch (syncError) {
    // biome-ignore lint/suspicious/noConsole: best-effort outbound sync for story update
    console.error('Failed to sync story to Linear', syncError);
    return NextResponse.json(data);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = await createClient();
  const { data, error } = await supabase.from('stories').delete().eq('id', id).select().single();

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Story');
    }
    return serverErrorResponse('Failed to delete story', error);
  }
  return NextResponse.json({ success: true, deleted: data });
}
