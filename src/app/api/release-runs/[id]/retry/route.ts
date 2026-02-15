import { NextResponse } from 'next/server';
import { domainRuntime } from '@/domains/runtime';
import { getLinearStorySyncTargetForStoryMap } from '@/integrations/linear/settings';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import { syncStoryToLinear } from '@/integrations/linear/story-sync';
import type { OpenCodeSessionPort } from '@/integrations/opencode/contracts';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

type Supabase = Awaited<ReturnType<typeof createClient>>;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Release run retry item failed';
}

function summarizeStatuses(items: Array<{ status: string }>) {
  const completed = items.filter((item) => item.status === 'synced').length;
  const failed = items.filter((item) => item.status === 'failed').length;
  return { completed, failed };
}

async function loadRun(supabase: Supabase, runId: string) {
  return supabase.from('release_runs').select('id, release_id, story_map_id, total_items').eq('id', runId).single();
}

async function loadFailedItems(supabase: Supabase, runId: string) {
  return supabase
    .from('release_run_items')
    .select('id, story_id, retry_count')
    .eq('release_run_id', runId)
    .eq('status', 'failed');
}

async function retryFailedItem(
  supabase: Supabase,
  input: {
    item: { id: string; story_id: string; retry_count: number };
    releaseId: string;
    linearIssueSync: NonNullable<typeof domainRuntime.storyMap.linearIssueSync>;
    openCodeSessions: OpenCodeSessionPort | null;
    target: { teamId: string; projectId?: string; stateId?: string };
  },
): Promise<'synced' | 'failed'> {
  const retryCount = (input.item.retry_count ?? 0) + 1;
  const retriedAt = new Date().toISOString();

  try {
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('*')
      .eq('id', input.item.story_id)
      .single();
    if (storyError || !story) throw storyError ?? new Error('Story not found');

    const existingLink = await getStoryLinearLink(supabase, input.item.story_id);
    const linearIssue = await syncStoryToLinear(
      story,
      input.linearIssueSync,
      existingLink?.linearIssueId ?? null,
      input.target,
    );
    if (!linearIssue) throw new Error('Linear sync returned no issue snapshot');

    await upsertStoryLinearLink(supabase, {
      storyId: input.item.story_id,
      linearIssueId: linearIssue.id,
      linearIssueIdentifier: linearIssue.identifier,
      lastLocalUpdatedAt: story.updated_at ?? null,
      lastLinearUpdatedAt: linearIssue.updatedAt,
    });

    const openCodeSession = input.openCodeSessions
      ? await input.openCodeSessions.createSession({
          releaseId: input.releaseId,
          storyId: input.item.story_id,
          storyTitle: story.title,
          linearIssueId: linearIssue.id,
          linearIssueIdentifier: linearIssue.identifier,
          requirements: story.requirements,
          acceptanceCriteria: story.acceptance_criteria,
          technicalGuidelines: story.technical_guidelines,
        })
      : null;

    await supabase
      .from('release_run_items')
      .update({
        status: 'synced',
        linear_issue_id: linearIssue.id,
        opencode_session_id: openCodeSession?.id ?? null,
        opencode_session_url: openCodeSession?.url ?? null,
        error: null,
        retry_count: retryCount,
        last_retry_at: retriedAt,
      })
      .eq('id', input.item.id);

    return 'synced';
  } catch (error) {
    await supabase
      .from('release_run_items')
      .update({
        status: 'failed',
        error: toErrorMessage(error),
        retry_count: retryCount,
        last_retry_at: retriedAt,
      })
      .eq('id', input.item.id);
    return 'failed';
  }
}

async function finalizeRunFromItems(supabase: Supabase, runId: string) {
  const { data: finalItems, error: finalItemsError } = await supabase
    .from('release_run_items')
    .select('status')
    .eq('release_run_id', runId);

  if (finalItemsError || !finalItems) {
    return {
      error: finalItemsError ?? new Error('No run items'),
      summary: null,
    };
  }

  const { completed, failed } = summarizeStatuses(finalItems as Array<{ status: string }>);
  const finalStatus = failed > 0 ? 'failed' : 'completed';

  const { error: runUpdateError } = await supabase
    .from('release_runs')
    .update({
      status: finalStatus,
      completed_items: completed,
      failed_items: failed,
      error: failed > 0 ? `${failed} item(s) failed` : null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId);

  if (runUpdateError) {
    return {
      error: runUpdateError,
      summary: null,
    };
  }

  return {
    error: null,
    summary: {
      finalStatus,
      completed,
      failed,
    },
  };
}

async function retryReleaseRunById(
  supabase: Supabase,
  input: {
    runId: string;
    linearIssueSync: NonNullable<typeof domainRuntime.storyMap.linearIssueSync>;
    openCodeSessions: OpenCodeSessionPort | null;
  },
) {
  const { data: run, error: runError } = await loadRun(supabase, input.runId);
  if (runError) {
    if (runError.code === DbErrorCode.NOT_FOUND) return notFoundResponse('Release run');
    return serverErrorResponse('Failed to load release run', runError);
  }

  const target = await getLinearStorySyncTargetForStoryMap(supabase, run.story_map_id);
  if (!target) {
    return NextResponse.json({ error: 'No linear target configured for release run team' }, { status: 400 });
  }

  const { data: failedItems, error: failedItemsError } = await loadFailedItems(supabase, input.runId);
  if (failedItemsError) return serverErrorResponse('Failed to load failed release run items', failedItemsError);

  if (!failedItems || failedItems.length === 0) {
    return NextResponse.json({
      run_id: input.runId,
      retried_items: 0,
      succeeded: 0,
      failed: 0,
      status: 'completed',
    });
  }

  await supabase.from('release_runs').update({ status: 'running', error: null }).eq('id', input.runId);

  let retriedSucceeded = 0;
  let retriedFailed = 0;

  for (const item of failedItems) {
    const result = await retryFailedItem(supabase, {
      item,
      releaseId: run.release_id,
      linearIssueSync: input.linearIssueSync,
      openCodeSessions: input.openCodeSessions,
      target,
    });
    if (result === 'synced') retriedSucceeded += 1;
    if (result === 'failed') retriedFailed += 1;
  }

  const finalized = await finalizeRunFromItems(supabase, input.runId);
  if (finalized.error || !finalized.summary) {
    return serverErrorResponse('Failed to summarize release run retry', finalized.error);
  }

  return NextResponse.json({
    run_id: input.runId,
    retried_items: failedItems.length,
    succeeded: retriedSucceeded,
    failed: retriedFailed,
    status: finalized.summary.finalStatus,
    total_items: run.total_items,
    completed_items: finalized.summary.completed,
    failed_items: finalized.summary.failed,
  });
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await domainRuntime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const linearIssueSync = domainRuntime.storyMap.linearIssueSync;
  if (!linearIssueSync) return NextResponse.json({ error: 'Linear integration is not enabled' }, { status: 503 });
  const openCodeSessions = domainRuntime.storyMap.openCodeSessions;

  const { id: runId } = await params;
  if (!isValidUuid(runId)) return invalidIdResponse();

  const supabase = await createClient();
  return retryReleaseRunById(supabase, {
    runId,
    linearIssueSync,
    openCodeSessions,
  });
}
