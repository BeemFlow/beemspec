import { NextResponse } from 'next/server';
import { getLinearStorySyncTargetForStory } from '@/integrations/linear/settings';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import { syncStoryToLinear } from '@/integrations/linear/story-sync';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid, pickDefined, updateStorySchema, validateRequest } from '@/lib/validations';
import { runtime } from '@/runtime';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await runtime.storyMap.auth.requireAuth();
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
  const auth = await runtime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

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

  if (!runtime.storyMap.linearIssueSync) {
    return NextResponse.json(data);
  }

  try {
    const target = await getLinearStorySyncTargetForStory(supabase, data.id);
    const existingLink = await getStoryLinearLink(supabase, data.id);
    const linearIssue = await syncStoryToLinear(
      data,
      runtime.storyMap.linearIssueSync,
      existingLink?.linearIssueId ?? null,
      target,
    );

    if (!linearIssue) {
      return NextResponse.json(data);
    }

    try {
      await upsertStoryLinearLink(supabase, {
        storyId: data.id,
        linearIssueId: linearIssue.id,
        linearIssueIdentifier: linearIssue.identifier,
        lastLocalUpdatedAt: data.updated_at ?? null,
        lastLinearUpdatedAt: linearIssue.updatedAt,
      });
    } catch (linkError) {
      // biome-ignore lint/suspicious/noConsole: best-effort link persistence
      console.error('Failed to persist story-linear link after story update sync', linkError);
    }

    return NextResponse.json({
      ...data,
      linear_issue: linearIssue,
    });
  } catch (syncError) {
    // biome-ignore lint/suspicious/noConsole: best-effort outbound sync
    console.error('Failed to sync updated story to Linear', syncError);
    return NextResponse.json(data);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await runtime.storyMap.auth.requireAuth();
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
