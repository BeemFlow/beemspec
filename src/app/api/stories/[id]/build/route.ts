import { NextResponse } from 'next/server';
import {
  appendBuildRunItems,
  createBuildRunWithItems,
  loadStoryWithStoryMap,
  processBuildRunById,
} from '@/build-runs/processor';
import { createOpenCodeSessions } from '@/integrations/opencode/session';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadBuildRunById(supabase: Supabase, buildRunId: string) {
  return supabase
    .from('build_runs')
    .select('id, release_id, story_map_id, status, total_items')
    .eq('id', buildRunId)
    .single();
}

function responseForStoryContextFailure(
  loaded: Extract<Awaited<ReturnType<typeof loadStoryWithStoryMap>>, { ok: false }>,
) {
  if (loaded.reason === 'story_not_found') return NextResponse.json({ error: 'Story not found' }, { status: 404 });
  if (loaded.reason === 'story_task_not_found') {
    return serverErrorResponse('Failed to resolve story task', loaded.error ?? new Error('Task not found'));
  }
  return serverErrorResponse('Failed to resolve story map for story', loaded.error ?? new Error('Activity not found'));
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: route handles create-or-append build run flow
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const openCodeSessions = createOpenCodeSessions(true);
  if (!openCodeSessions) return NextResponse.json({ error: 'OpenCode integration is not enabled' }, { status: 503 });

  const { id: storyId } = await params;
  if (!isValidUuid(storyId)) return invalidIdResponse();

  const supabase = await createClient();
  const loaded = await loadStoryWithStoryMap(supabase, storyId);
  if (!loaded.ok) return responseForStoryContextFailure(loaded);

  const { story, storyMapId } = loaded.data;
  const targetBuildRunId = new URL(request.url).searchParams.get('build_run_id');

  if (targetBuildRunId) {
    if (!isValidUuid(targetBuildRunId)) return invalidIdResponse();

    const { data: targetRun, error: targetRunError } = await loadBuildRunById(supabase, targetBuildRunId);
    if (targetRunError) {
      if (targetRunError.code === DbErrorCode.NOT_FOUND) return notFoundResponse('Build run');
      return serverErrorResponse('Failed to load target build run', targetRunError);
    }

    if (targetRun.story_map_id !== storyMapId) {
      return NextResponse.json({ error: 'Story does not belong to the target build run story map' }, { status: 400 });
    }

    if (targetRun.release_id && story.release_id !== targetRun.release_id) {
      return NextResponse.json({ error: 'Story release does not match target build run release' }, { status: 400 });
    }

    const { data: appendResult, error: appendError } = await appendBuildRunItems(supabase, {
      buildRunId: targetBuildRunId,
      storyIds: [storyId],
    });
    if (appendError || !appendResult) {
      return serverErrorResponse(
        'Failed to append story to target build run',
        appendError ?? new Error('Append failed'),
      );
    }

    try {
      await processBuildRunById(supabase, {
        runId: targetBuildRunId,
        releaseId: (targetRun.release_id as string | null) ?? null,
        storyIds: [storyId],
        openCodeSessions,
      });
    } catch (error) {
      return serverErrorResponse('Failed to process build run', error);
    }

    return NextResponse.json(
      {
        run_id: targetBuildRunId,
        build_run_id: targetBuildRunId,
        story_id: storyId,
        status: 'completed',
        appended_item: appendResult.appended_items > 0,
      },
      { status: 200 },
    );
  }

  const { data: runResult, error: runCreateError } = await createBuildRunWithItems(supabase, {
    releaseId: story.release_id,
    storyMapId,
    userId: auth.user.id,
    storyIds: [storyId],
  });
  if (runCreateError || !runResult) {
    return serverErrorResponse('Failed to create story build run', runCreateError ?? new Error('Run not created'));
  }

  try {
    await processBuildRunById(supabase, {
      runId: runResult.run_id,
      releaseId: story.release_id,
      storyIds: [storyId],
      openCodeSessions,
    });
  } catch (error) {
    return serverErrorResponse('Failed to process build run', error);
  }

  return NextResponse.json(
    {
      run_id: runResult.run_id,
      build_run_id: runResult.run_id,
      story_id: storyId,
      status: 'completed',
    },
    { status: 200 },
  );
}
