import { NextResponse } from 'next/server';
import { BUILD_RUN_STATUS } from '@/build-runs/constants';
import { appendBuildRunItems, createBuildRunWithItems, processBuildRunById } from '@/build-runs/processor';
import { createOpenCodeSessions } from '@/integrations/opencode/session';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadRelease(supabase: Supabase, releaseId: string) {
  const { data, error } = await supabase.from('releases').select('id, story_map_id').eq('id', releaseId).single();
  return { data, error };
}

async function loadStoryIdsInRelease(supabase: Supabase, releaseId: string) {
  return supabase.from('stories').select('id').eq('release_id', releaseId).order('sort_order', { ascending: true });
}

async function loadActiveRunForRelease(supabase: Supabase, releaseId: string) {
  return supabase
    .from('build_runs')
    .select('id, story_map_id, release_id, status')
    .eq('release_id', releaseId)
    .in('status', [BUILD_RUN_STATUS.queued, BUILD_RUN_STATUS.running])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: route handles create-or-append run flow
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const openCodeSessions = createOpenCodeSessions(true);
  if (!openCodeSessions) return NextResponse.json({ error: 'OpenCode integration is not enabled' }, { status: 503 });

  const { id: releaseId } = await params;
  if (!isValidUuid(releaseId)) return invalidIdResponse();

  const supabase = await createClient();
  const { data: release, error: releaseError } = await loadRelease(supabase, releaseId);
  if (releaseError) {
    if (releaseError.code === DbErrorCode.NOT_FOUND) return notFoundResponse('Release');
    return serverErrorResponse('Failed to load release', releaseError);
  }
  if (!release) return notFoundResponse('Release');

  const { data: stories, error: storiesError } = await loadStoryIdsInRelease(supabase, releaseId);
  if (storiesError) return serverErrorResponse('Failed to load release stories', storiesError);
  const storyIds = (stories ?? []).map((story) => story.id as string);

  const { data: activeRun, error: activeRunError } = await loadActiveRunForRelease(supabase, releaseId);
  if (activeRunError) return serverErrorResponse('Failed to load active build run', activeRunError);

  if (activeRun) {
    const { data: appendResult, error: appendError } = await appendBuildRunItems(supabase, {
      buildRunId: activeRun.id as string,
      storyIds,
    });
    if (appendError || !appendResult) {
      return serverErrorResponse('Failed to append release stories to active build run', appendError);
    }

    if (appendResult.appended_items > 0) {
      try {
        await processBuildRunById(supabase, {
          runId: activeRun.id as string,
          releaseId,
          storyIds,
          openCodeSessions,
        });
      } catch (error) {
        return serverErrorResponse('Failed to process build run', error);
      }
    }

    return NextResponse.json(
      {
        run_id: activeRun.id,
        build_run_id: activeRun.id,
        status: 'completed',
        appended_items: appendResult.appended_items,
      },
      { status: 200 },
    );
  }

  const { data: runResult, error: runCreateError } = await createBuildRunWithItems(supabase, {
    releaseId,
    storyMapId: release.story_map_id,
    userId: auth.user.id,
    storyIds,
  });
  if (runCreateError || !runResult) {
    return serverErrorResponse('Failed to create build run', runCreateError ?? new Error('Run not created'));
  }

  if (runResult.total_items === 0) {
    return NextResponse.json(
      {
        run_id: runResult.run_id,
        build_run_id: runResult.run_id,
        status: 'completed',
      },
      { status: 200 },
    );
  }

  try {
    await processBuildRunById(supabase, {
      runId: runResult.run_id,
      releaseId,
      storyIds: runResult.created_story_ids,
      openCodeSessions,
    });
  } catch (error) {
    return serverErrorResponse('Failed to process build run', error);
  }

  return NextResponse.json(
    {
      run_id: runResult.run_id,
      build_run_id: runResult.run_id,
      status: 'completed',
    },
    { status: 200 },
  );
}
