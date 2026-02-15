import type { OpenCodeSessions } from '@/integrations/opencode/types';
import type { createClient } from '@/lib/supabase/server';
import { insertFailedBuildRunItem, syncAndInsertRunItem } from '@/orchestration/release-build/run-items';
import {
  markBuildRunRunning,
  summarizeAndFinishBuildRun,
  toErrorMessage,
} from '@/orchestration/release-build/run-records';
import type { Story } from '@/types';

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadRunSession(supabase: Supabase, runId: string): Promise<{ id: string; url: string } | null> {
  const { data, error } = await supabase
    .from('build_runs')
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
    .from('build_runs')
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
