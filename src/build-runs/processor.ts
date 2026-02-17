import {
  BUILD_RUN_ITEM_STATUS,
  BUILD_RUN_ITEMS_TABLE,
  BUILD_RUN_STATUS,
  BUILD_RUN_TABLE,
  type BuildRunItemStatus,
} from '@/build-runs/constants';
import { getStoryLinearLink } from '@/integrations/linear/story-links';
import { createOpenCodeSessions, type OpenCodeSessions } from '@/integrations/opencode/session';
import type { createClient } from '@/lib/supabase/server';
import type { Story } from '@/types';

type Supabase = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// Lazy session-state refresh — transitions stale "running" runs
// ---------------------------------------------------------------------------

export async function refreshRunStatusFromOpenCode(
  supabase: Supabase,
  run: { id: string; status: string; opencode_session_id?: string | null },
): Promise<{ id: string; status: string }> {
  if (run.status !== BUILD_RUN_STATUS.running || !run.opencode_session_id) return run;

  const sessions = createOpenCodeSessions(true);
  if (!sessions) return run;

  let session: Awaited<ReturnType<OpenCodeSessions['getSessionById']>>;
  try {
    session = await sessions.getSessionById(run.opencode_session_id);
  } catch (error) {
    console.error('Failed to refresh OpenCode session status', error);
    return run;
  }

  if (!session) {
    await supabase
      .from(BUILD_RUN_TABLE)
      .update({
        status: BUILD_RUN_STATUS.failed,
        finished_at: new Date().toISOString(),
        error: 'OpenCode session was deleted before completion.',
      })
      .eq('id', run.id);

    return { ...run, status: BUILD_RUN_STATUS.failed };
  }

  if (session.state === 'active') return run;

  const newStatus = session.state === 'failed' ? BUILD_RUN_STATUS.failed : BUILD_RUN_STATUS.completed;
  await supabase
    .from(BUILD_RUN_TABLE)
    .update({ status: newStatus, finished_at: new Date().toISOString() })
    .eq('id', run.id);

  return { ...run, status: newStatus };
}

type StoryBuildContextFailureReason = 'story_not_found' | 'story_task_not_found' | 'story_activity_not_found';

export type StoryWithMapResult =
  | {
      ok: true;
      data: {
        story: Story;
        storyMapId: string;
      };
    }
  | {
      ok: false;
      reason: StoryBuildContextFailureReason;
      error?: unknown;
    };

interface ExistingBuildRunItemRow {
  status: BuildRunItemStatus;
  linear_issue_id: string | null;
  retry_count: number;
  last_retry_at: string | null;
}

// ---------------------------------------------------------------------------
// Run & item creation (replaces queue RPCs)
// ---------------------------------------------------------------------------

export interface CreateBuildRunResult {
  run_id: string;
  created_story_ids: string[];
  total_items: number;
}

export interface AppendBuildRunItemsResult {
  appended_items: number;
  total_items: number;
}

export async function createBuildRunWithItems(
  supabase: Supabase,
  input: {
    releaseId: string | null;
    storyMapId: string;
    userId: string;
    storyIds: string[];
    workingDirectory?: string | null;
  },
) {
  return supabase
    .rpc('create_build_run_with_items', {
      p_release_id: input.releaseId,
      p_story_map_id: input.storyMapId,
      p_triggered_by: input.userId,
      p_story_ids: input.storyIds,
      p_working_directory: input.workingDirectory ?? null,
    })
    .single<CreateBuildRunResult>();
}

export async function appendBuildRunItems(
  supabase: Supabase,
  input: {
    buildRunId: string;
    storyIds: string[];
  },
) {
  return supabase
    .rpc('append_build_run_items', {
      p_build_run_id: input.buildRunId,
      p_story_ids: input.storyIds,
    })
    .single<AppendBuildRunItemsResult>();
}

// ---------------------------------------------------------------------------
// Item-level helpers
// ---------------------------------------------------------------------------

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

async function loadExistingBuildRunItem(
  supabase: Supabase,
  input: { runId: string; storyId: string },
): Promise<ExistingBuildRunItemRow | null> {
  const { data, error } = await supabase
    .from(BUILD_RUN_ITEMS_TABLE)
    .select('status, linear_issue_id, retry_count, last_retry_at')
    .eq('build_run_id', input.runId)
    .eq('story_id', input.storyId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    status: data.status as ExistingBuildRunItemRow['status'],
    linear_issue_id: (data.linear_issue_id as string | null) ?? null,
    retry_count: data.retry_count as number,
    last_retry_at: (data.last_retry_at as string | null) ?? null,
  };
}

function retryMetadata(existing: ExistingBuildRunItemRow | null): { retryCount: number; lastRetryAt: string | null } {
  if (!existing) return { retryCount: 0, lastRetryAt: null };
  if (existing.status !== BUILD_RUN_ITEM_STATUS.failed) {
    return {
      retryCount: existing.retry_count,
      lastRetryAt: existing.last_retry_at,
    };
  }
  return {
    retryCount: existing.retry_count + 1,
    lastRetryAt: new Date().toISOString(),
  };
}

async function insertSyncedRunItem(
  supabase: Supabase,
  input: {
    runId: string;
    storyId: string;
    linearIssueId: string | null;
    retryCount: number;
    lastRetryAt: string | null;
  },
) {
  return supabase
    .from(BUILD_RUN_ITEMS_TABLE)
    .upsert(
      {
        build_run_id: input.runId,
        story_id: input.storyId,
        linear_issue_id: input.linearIssueId,
        status: BUILD_RUN_ITEM_STATUS.synced,
        error: null,
        retry_count: input.retryCount,
        last_retry_at: input.lastRetryAt,
      },
      { onConflict: 'build_run_id,story_id' },
    )
    .select('id')
    .single();
}

async function insertFailedBuildRunItem(
  supabase: Supabase,
  input: {
    runId: string;
    storyId: string;
    error: string;
  },
) {
  const existing = await loadExistingBuildRunItem(supabase, input);
  const retry = retryMetadata(existing);

  return supabase
    .from(BUILD_RUN_ITEMS_TABLE)
    .upsert(
      {
        build_run_id: input.runId,
        story_id: input.storyId,
        status: BUILD_RUN_ITEM_STATUS.failed,
        error: input.error,
        retry_count: retry.retryCount,
        last_retry_at: retry.lastRetryAt,
      },
      { onConflict: 'build_run_id,story_id' },
    )
    .select('id')
    .single();
}

// ---------------------------------------------------------------------------
// Per-story sync
// ---------------------------------------------------------------------------

async function syncAndInsertRunItem(
  supabase: Supabase,
  input: {
    runId: string;
    storyId: string;
    story: Story;
    runSession: { id: string; url: string } | null;
    openCodeSessions: OpenCodeSessions | null;
    workingDirectory?: string | null;
  },
) {
  const link = await getStoryLinearLink(supabase, input.story.id);
  const linearIssueId = link?.linearIssueId ?? null;
  const linearIssueIdentifier = link?.linearIssueIdentifier ?? link?.linearIssueId ?? null;
  const existing = await loadExistingBuildRunItem(supabase, input);

  if (existing?.status === BUILD_RUN_ITEM_STATUS.synced && existing.linear_issue_id === linearIssueId) {
    return {
      linearIssue: linearIssueId ? { id: linearIssueId, identifier: linearIssueIdentifier! } : null,
      session: input.runSession,
    };
  }

  const retry = retryMetadata(existing);

  if (input.runSession && input.openCodeSessions) {
    await input.openCodeSessions.appendStoryAssignment({
      sessionId: input.runSession.id,
      runId: input.runId,
      storyId: input.story.id,
      storyTitle: input.story.title,
      linearIssueIdentifier,
      workingDirectory: input.workingDirectory,
      requirements: input.story.requirements,
      acceptanceCriteria: input.story.acceptance_criteria,
      technicalGuidelines: input.story.technical_guidelines,
    });
  }

  await insertSyncedRunItem(supabase, {
    runId: input.runId,
    storyId: input.storyId,
    linearIssueId,
    retryCount: retry.retryCount,
    lastRetryAt: retry.lastRetryAt,
  });

  return {
    linearIssue: linearIssueId ? { id: linearIssueId, identifier: linearIssueIdentifier! } : null,
    session: input.runSession,
  };
}

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------

async function markBuildRunRunning(supabase: Supabase, runId: string) {
  return supabase.from(BUILD_RUN_TABLE).update({ status: BUILD_RUN_STATUS.running, error: null }).eq('id', runId);
}

async function finishBuildRun(
  supabase: Supabase,
  input: {
    runId: string;
    status: typeof BUILD_RUN_STATUS.completed | typeof BUILD_RUN_STATUS.failed;
    completedItems: number;
    failedItems: number;
    error: string | null;
  },
) {
  return supabase
    .from(BUILD_RUN_TABLE)
    .update({
      status: input.status,
      completed_items: input.completedItems,
      failed_items: input.failedItems,
      finished_at: new Date().toISOString(),
      error: input.error,
    })
    .eq('id', input.runId);
}

async function updateBuildRunCounts(
  supabase: Supabase,
  input: { runId: string; completedItems: number; failedItems: number; error: string | null },
) {
  return supabase
    .from(BUILD_RUN_TABLE)
    .update({
      completed_items: input.completedItems,
      failed_items: input.failedItems,
      error: input.error,
    })
    .eq('id', input.runId);
}

function summarizeBuildRunItemStatuses(items: Array<{ status: string }>) {
  const completed = items.filter((item) => item.status === BUILD_RUN_ITEM_STATUS.synced).length;
  const failed = items.filter((item) => item.status === BUILD_RUN_ITEM_STATUS.failed).length;
  return { completed, failed };
}

async function summarizeAndFinishBuildRun(supabase: Supabase, runId: string) {
  const { data: items, error: itemsError } = await supabase
    .from(BUILD_RUN_ITEMS_TABLE)
    .select('status')
    .eq('build_run_id', runId);
  if (itemsError || !items) throw itemsError ?? new Error('Failed to load build run items');

  const { completed, failed } = summarizeBuildRunItemStatuses(items as Array<{ status: string }>);
  const status = failed > 0 ? BUILD_RUN_STATUS.failed : BUILD_RUN_STATUS.completed;
  await finishBuildRun(supabase, {
    runId,
    status,
    completedItems: completed,
    failedItems: failed,
    error: failed > 0 ? `${failed} item(s) failed` : null,
  });

  return { status, completed, failed };
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

async function loadRunSession(supabase: Supabase, runId: string): Promise<{ id: string; url: string } | null> {
  const { data, error } = await supabase
    .from(BUILD_RUN_TABLE)
    .select('opencode_session_id, opencode_session_url')
    .eq('id', runId)
    .single();
  if (error || !data) throw error ?? new Error('Build run not found');

  if (!data.opencode_session_id || !data.opencode_session_url) return null;
  return {
    id: data.opencode_session_id as string,
    url: data.opencode_session_url as string,
  };
}

async function persistRunSession(
  supabase: Supabase,
  input: { runId: string; sessionId: string; sessionUrl: string },
): Promise<void> {
  const { error } = await supabase
    .from(BUILD_RUN_TABLE)
    .update({
      opencode_session_id: input.sessionId,
      opencode_session_url: input.sessionUrl,
    })
    .eq('id', input.runId);
  if (error) throw error;
}

async function ensureRunSession(
  supabase: Supabase,
  input: {
    runId: string;
    releaseId: string | null;
    stories: Story[];
    workingDirectory: string | null;
    openCodeSessions: OpenCodeSessions | null;
  },
): Promise<{ id: string; url: string } | null> {
  const existing = await loadRunSession(supabase, input.runId);
  if (existing) return existing;

  if (!input.openCodeSessions) {
    throw new Error('OpenCode integration is not enabled');
  }

  const storyIds = input.stories.map((story) => story.id);
  const { data: links, error: linksError } = await supabase
    .from('story_linear_links')
    .select('story_id, linear_issue_identifier')
    .in('story_id', storyIds);
  if (linksError) throw linksError;

  const issueIdentifierByStoryId = new Map(
    (links ?? []).map((link) => [link.story_id as string, (link.linear_issue_identifier as string | null) ?? null]),
  );

  const seededStories = input.stories.map((story) => ({
    storyId: story.id,
    storyTitle: story.title,
    linearIssueIdentifier: issueIdentifierByStoryId.get(story.id) ?? null,
  }));

  const created = await input.openCodeSessions.createSession({
    releaseId: input.releaseId ?? undefined,
    runId: input.runId,
    workingDirectory: input.workingDirectory ?? undefined,
    technicalGuidelines: null,
    stories: seededStories,
  });

  await persistRunSession(supabase, {
    runId: input.runId,
    sessionId: created.id,
    sessionUrl: created.url,
  });

  return { id: created.id, url: created.url };
}

// ---------------------------------------------------------------------------
// Main processing entry point
// ---------------------------------------------------------------------------

async function processRunItems(
  supabase: Supabase,
  input: {
    runId: string;
    stories: Story[];
    runSession: { id: string; url: string } | null;
    openCodeSessions: OpenCodeSessions | null;
    workingDirectory?: string | null;
  },
) {
  let completedItems = 0;
  let failedItems = 0;

  for (const story of input.stories) {
    try {
      await syncAndInsertRunItem(supabase, {
        runId: input.runId,
        storyId: story.id,
        story,
        runSession: input.runSession,
        openCodeSessions: input.openCodeSessions,
        workingDirectory: input.workingDirectory,
      });

      completedItems += 1;
    } catch (error) {
      failedItems += 1;
      await insertFailedBuildRunItem(supabase, {
        runId: input.runId,
        storyId: story.id,
        error: toErrorMessage(error, 'Build run item failed'),
      });
    }
  }

  return { completedItems, failedItems };
}

export async function processBuildRunById(
  supabase: Supabase,
  input: {
    runId: string;
    releaseId: string | null;
    storyIds: string[];
    workingDirectory?: string | null;
    openCodeSessions: OpenCodeSessions | null;
  },
) {
  await markBuildRunRunning(supabase, input.runId);

  if (input.storyIds.length === 0) {
    const summary = await summarizeAndFinishBuildRun(supabase, input.runId);
    return { status: summary.status, totalItems: 0, completedItems: 0, failedItems: 0 };
  }

  const { data: stories, error: storiesError } = await supabase
    .from('stories')
    .select('*')
    .in('id', input.storyIds)
    .order('sort_order', { ascending: true });
  if (storiesError) throw storiesError;

  const runSession = await ensureRunSession(supabase, {
    runId: input.runId,
    releaseId: input.releaseId,
    stories: (stories ?? []) as Story[],
    workingDirectory: input.workingDirectory ?? null,
    openCodeSessions: input.openCodeSessions,
  });

  const { completedItems, failedItems } = await processRunItems(supabase, {
    runId: input.runId,
    stories: (stories ?? []) as Story[],
    runSession,
    openCodeSessions: input.openCodeSessions,
    workingDirectory: input.workingDirectory,
  });

  // If stories were dispatched to an OpenCode session, fire the start prompt
  // (non-blocking) and leave the run in "running" — the agent is working.
  // Only auto-finish the run if all items failed or there's no session.
  if (runSession && input.openCodeSessions && completedItems > 0) {
    input.openCodeSessions.startSession(runSession.id, completedItems, input.workingDirectory).catch((err) => {
      console.error('Failed to send start prompt to OpenCode session', err);
    });

    await updateBuildRunCounts(supabase, {
      runId: input.runId,
      completedItems,
      failedItems,
      error: failedItems > 0 ? `${failedItems} item(s) failed to sync` : null,
    });

    return {
      status: BUILD_RUN_STATUS.running,
      totalItems: (stories ?? []).length,
      completedItems,
      failedItems,
    };
  }

  const summary = await summarizeAndFinishBuildRun(supabase, input.runId);
  return {
    status: summary.status,
    totalItems: (stories ?? []).length,
    completedItems,
    failedItems,
  };
}

// ---------------------------------------------------------------------------
// Story context loading (used by story build route)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mark story blocked (shared by MCP tool + REST route)
// ---------------------------------------------------------------------------

export type MarkStoryBlockedResult = { ok: true } | { ok: false; error: string; status: number };

export async function markStoryBlocked(
  supabase: Supabase,
  input: { storyId: string; reason: string },
): Promise<MarkStoryBlockedResult> {
  const blockedReason = `Blocked: ${input.reason}`;

  const { data: latestItem, error: latestItemError } = await supabase
    .from(BUILD_RUN_ITEMS_TABLE)
    .select('id')
    .eq('story_id', input.storyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestItemError) return { ok: false, error: 'Failed to locate build run item', status: 500 };
  if (!latestItem) return { ok: false, error: 'No build run item found for story', status: 404 };

  const { error: updateError } = await supabase
    .from(BUILD_RUN_ITEMS_TABLE)
    .update({ status: 'failed', error: blockedReason, last_retry_at: new Date().toISOString() })
    .eq('id', latestItem.id);

  if (updateError) return { ok: false, error: 'Failed to mark story blocked', status: 500 };
  return { ok: true };
}

export async function loadStoryWithStoryMap(supabase: Supabase, storyId: string): Promise<StoryWithMapResult> {
  const { data: story, error: storyError } = await supabase.from('stories').select('*').eq('id', storyId).single();
  if (storyError || !story) return { ok: false, reason: 'story_not_found', error: storyError };

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('activity_id')
    .eq('id', story.task_id)
    .single();
  if (taskError || !task) return { ok: false, reason: 'story_task_not_found', error: taskError };

  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .select('story_map_id')
    .eq('id', task.activity_id)
    .single();
  if (activityError || !activity) return { ok: false, reason: 'story_activity_not_found', error: activityError };

  return {
    ok: true,
    data: {
      story: story as Story,
      storyMapId: activity.story_map_id as string,
    },
  };
}
