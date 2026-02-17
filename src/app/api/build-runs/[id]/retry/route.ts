import { NextResponse } from 'next/server';
import { BUILD_RUN_ITEM_STATUS, BUILD_RUN_ITEMS_TABLE, BUILD_RUN_TABLE } from '@/build-runs/constants';
import { processBuildRunById } from '@/build-runs/processor';
import { createOpenCodeSessions } from '@/integrations/opencode/session';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadRun(supabase: Supabase, runId: string) {
  return supabase
    .from(BUILD_RUN_TABLE)
    .select('id, release_id, story_map_id, total_items, working_directory')
    .eq('id', runId)
    .single();
}

async function loadFailedItemStoryIds(supabase: Supabase, runId: string) {
  const { data, error } = await supabase
    .from(BUILD_RUN_ITEMS_TABLE)
    .select('story_id')
    .eq('build_run_id', runId)
    .eq('status', BUILD_RUN_ITEM_STATUS.failed);
  return {
    storyIds: (data ?? []).map((item) => item.story_id as string),
    error,
  };
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const openCodeSessions = createOpenCodeSessions(true);
  if (!openCodeSessions) return NextResponse.json({ error: 'OpenCode integration is not enabled' }, { status: 503 });

  const { id: runId } = await params;
  if (!isValidUuid(runId)) return invalidIdResponse();

  const supabase = await createClient();
  const { data: run, error: runError } = await loadRun(supabase, runId);
  if (runError) {
    if (runError.code === DbErrorCode.NOT_FOUND) return notFoundResponse('Build run');
    return serverErrorResponse('Failed to load build run', runError);
  }

  const { storyIds, error: failedItemsError } = await loadFailedItemStoryIds(supabase, runId);
  if (failedItemsError) return serverErrorResponse('Failed to load failed build run items', failedItemsError);

  if (storyIds.length === 0) {
    return NextResponse.json({
      run_id: runId,
      build_run_id: runId,
      retried_items: 0,
      status: 'completed',
    });
  }

  try {
    await processBuildRunById(supabase, {
      runId,
      releaseId: run.release_id,
      storyIds,
      workingDirectory: run.working_directory as string | null,
      openCodeSessions,
    });
  } catch (error) {
    return serverErrorResponse('Failed to process retry', error);
  }

  return NextResponse.json({
    run_id: runId,
    build_run_id: runId,
    retried_items: storyIds.length,
    status: 'completed',
  });
}
