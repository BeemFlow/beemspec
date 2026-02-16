import {
  BUILD_RUN_ITEM_STATUS,
  BUILD_RUN_ITEMS_TABLE,
  BUILD_RUN_STATUS,
  BUILD_RUN_TABLE,
  type BuildRunItemStatus,
} from '@/build-runs/constants';
import { getLinearStorySyncTargetForStoryMap } from '@/integrations/linear/settings';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import { syncStoryToLinear } from '@/integrations/linear/story-sync';
import type { LinearIssueSync } from '@/integrations/linear/types';
import type { OpenCodeSessions } from '@/integrations/opencode/types';
import type { createClient } from '@/lib/supabase/server';
import type { Story } from '@/types';

type Supabase = Awaited<ReturnType<typeof createClient>>;

type StoryBuildContextFailureReason = 'story_not_found' | 'story_task_not_found' | 'story_activity_not_found';

export type StoryBuildContextResult =
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
    linearIssueId: string;
    sessionId: string | null;
    sessionUrl: string | null;
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
        opencode_session_id: input.sessionId,
        opencode_session_url: input.sessionUrl,
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

async function syncAndInsertRunItem(
  supabase: Supabase,
  input: {
    runId: string;
    storyId: string;
    story: Story;
    runSession: { id: string; url: string } | null;
    openCodeSessions: OpenCodeSessions | null;
  },
) {
  const link = await getStoryLinearLink(supabase, input.story.id);
  if (!link) throw new Error('Story is not synced to Linear. Use sync to Linear before building.');

  const linearIssueId = link.linearIssueId;
  const linearIssueIdentifier = link.linearIssueIdentifier ?? link.linearIssueId;
  const existing = await loadExistingBuildRunItem(supabase, input);

  if (existing?.status === BUILD_RUN_ITEM_STATUS.synced && existing.linear_issue_id === linearIssueId) {
    return {
      linearIssue: { id: linearIssueId, identifier: linearIssueIdentifier },
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
      requirements: input.story.requirements,
      acceptanceCriteria: input.story.acceptance_criteria,
      technicalGuidelines: input.story.technical_guidelines,
    });
  }

  await insertSyncedRunItem(supabase, {
    runId: input.runId,
    storyId: input.storyId,
    linearIssueId,
    sessionId: input.runSession?.id ?? null,
    sessionUrl: input.runSession?.url ?? null,
    retryCount: retry.retryCount,
    lastRetryAt: retry.lastRetryAt,
  });

  return {
    linearIssue: { id: linearIssueId, identifier: linearIssueIdentifier },
    session: input.runSession,
  };
}

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

async function processRunItems(
  supabase: Supabase,
  input: {
    runId: string;
    stories: Story[];
    runSession: { id: string; url: string } | null;
    openCodeSessions: OpenCodeSessions | null;
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
    openCodeSessions: input.openCodeSessions,
  });

  const { completedItems, failedItems } = await processRunItems(supabase, {
    runId: input.runId,
    stories: (stories ?? []) as Story[],
    runSession,
    openCodeSessions: input.openCodeSessions,
  });

  const summary = await summarizeAndFinishBuildRun(supabase, input.runId);
  return {
    status: summary.status,
    totalItems: (stories ?? []).length,
    completedItems,
    failedItems,
  };
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

export async function loadStoryBuildContext(supabase: Supabase, storyId: string): Promise<StoryBuildContextResult> {
  const context = await loadStoryWithStoryMap(supabase, storyId);
  if (!context.ok) return context;

  return {
    ok: true,
    data: context.data,
  };
}

export async function processStoryLinearSyncById(
  supabase: Supabase,
  input: {
    storyId: string;
    linearIssueSync: LinearIssueSync;
  },
) {
  const context = await loadStoryWithStoryMap(supabase, input.storyId);
  if (!context.ok) {
    if (context.reason === 'story_not_found') throw new Error('Story not found');
    if (context.reason === 'story_task_not_found') throw new Error('Task not found for story');
    throw new Error('Activity not found for story');
  }

  const { story, storyMapId } = context.data;
  const target = await getLinearStorySyncTargetForStoryMap(supabase, storyMapId);
  if (!target) throw new Error('No linear target configured for story map team');

  const existingLink = await getStoryLinearLink(supabase, input.storyId);
  const linearIssue = await syncStoryToLinear(
    story,
    input.linearIssueSync,
    existingLink?.linearIssueId ?? null,
    target,
  );
  if (!linearIssue) throw new Error('Linear sync returned no issue snapshot');

  await upsertStoryLinearLink(supabase, {
    storyId: input.storyId,
    linearIssueId: linearIssue.id,
    linearIssueIdentifier: linearIssue.identifier,
    lastLocalUpdatedAt: story.updated_at ?? null,
    lastLinearUpdatedAt: linearIssue.updatedAt,
  });

  return linearIssue;
}
