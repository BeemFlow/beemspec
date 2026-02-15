import type { OpenCodeSessions } from '@/integrations/opencode/types';
import type { createClient } from '@/lib/supabase/server';
import { insertFailedRunItem, syncAndInsertRunItem } from '@/orchestration/release-build/run-items';
import {
  markReleaseRunRunning,
  summarizeAndFinishReleaseRun,
  toErrorMessage,
} from '@/orchestration/release-build/run-records';
import type { Story } from '@/types';

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function processRunItems(
  supabase: Supabase,
  input: {
    runId: string;
    releaseId: string;
    stories: Story[];
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
        releaseId: input.releaseId,
        openCodeSessions: input.openCodeSessions,
      });

      completedItems += 1;
    } catch (error) {
      failedItems += 1;
      await insertFailedRunItem(supabase, {
        runId: input.runId,
        storyId: story.id,
        error: toErrorMessage(error, 'Release run item failed'),
      });
    }
  }

  return { completedItems, failedItems };
}

export async function processReleaseRunById(
  supabase: Supabase,
  input: {
    runId: string;
    releaseId: string;
    storyIds: string[];
    openCodeSessions: OpenCodeSessions | null;
  },
) {
  await markReleaseRunRunning(supabase, input.runId);

  if (input.storyIds.length === 0) {
    const summary = await summarizeAndFinishReleaseRun(supabase, input.runId);
    return { status: summary.status, totalItems: 0, completedItems: 0, failedItems: 0 };
  }

  const { data: stories, error: storiesError } = await supabase
    .from('stories')
    .select('*')
    .in('id', input.storyIds)
    .order('sort_order', { ascending: true });
  if (storiesError) throw storiesError;

  const { completedItems, failedItems } = await processRunItems(supabase, {
    runId: input.runId,
    releaseId: input.releaseId,
    stories: (stories ?? []) as Story[],
    openCodeSessions: input.openCodeSessions,
  });

  const summary = await summarizeAndFinishReleaseRun(supabase, input.runId);
  return {
    status: summary.status,
    totalItems: (stories ?? []).length,
    completedItems,
    failedItems,
  };
}
