import { NextResponse } from 'next/server';
import { loadStoryWithStoryMap } from '@/build-runs/processor';
import { enqueueStoryLinearSyncJob } from '@/build-runs/queue';
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
    const context = await loadStoryWithStoryMap(supabase, data.id);
    if (!context.ok) return NextResponse.json(data);

    const { data: job } = await enqueueStoryLinearSyncJob(supabase, {
      storyMapId: context.data.storyMapId,
      storyId: data.id,
    });
    if (!job) return NextResponse.json(data);

    return NextResponse.json({
      ...data,
      linear_sync: { status: 'queued', job_id: job.id },
    });
  } catch (queueError) {
    // biome-ignore lint/suspicious/noConsole: best-effort outbound sync enqueue
    console.error('Failed to enqueue story sync to Linear', queueError);
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
