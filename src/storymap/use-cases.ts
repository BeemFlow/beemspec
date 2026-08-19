import type { CreateStory, UpdateStory } from '@beemspec/storymap';
import { resolveLinearSyncContextForStory } from '@/integrations/linear/auth';
import { getStoryLinearLink } from '@/integrations/linear/story-links';
import { maybeSyncStoryToLinear } from '@/integrations/linear/sync';
import type { Supabase } from '@/lib/supabase/types';
import {
  createStory as createStoryRecord,
  deleteStory as deleteStoryRecord,
  updateStory as updateStoryRecord,
} from './service';

function withLinearSyncMetadata<T extends Record<string, unknown>>(
  story: T,
  linearIssue: { id: string; identifier: string },
) {
  return {
    ...story,
    linear_sync: {
      status: 'synced' as const,
      linear_issue_id: linearIssue.id,
      linear_issue_identifier: linearIssue.identifier,
    },
  };
}

async function syncSavedStory(supabase: Supabase, story: Record<string, unknown>) {
  try {
    const linearIssue = await maybeSyncStoryToLinear(supabase, story.id as string);
    return linearIssue ? withLinearSyncMetadata(story, linearIssue) : story;
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: best-effort outbound sync remains visible operationally
    console.error('Failed to sync story to Linear', error);
    return story;
  }
}

export async function createStory(supabase: Supabase, input: CreateStory) {
  const created = await createStoryRecord(supabase, input);
  if (created.error || !created.data) return created;

  return {
    data: await syncSavedStory(supabase, created.data),
    error: null,
  };
}

export async function updateStory(supabase: Supabase, storyId: string, changes: UpdateStory) {
  const updated = await updateStoryRecord(supabase, storyId, changes);
  if (updated.error || !updated.data) return updated;

  return {
    data: await syncSavedStory(supabase, updated.data),
    error: null,
  };
}

export async function deleteStory(supabase: Supabase, storyId: string) {
  try {
    const link = await getStoryLinearLink(supabase, storyId);
    if (link) {
      const context = await resolveLinearSyncContextForStory(supabase, { storyId });
      const issueSync = context.linearIssueSync;

      if (issueSync) {
        try {
          await issueSync.deleteIssue(link.linearIssueId);
        } catch (error) {
          const status = typeof error === 'object' && error && 'status' in error ? Number(error.status) : null;
          if (status !== 404) {
            // biome-ignore lint/suspicious/noConsole: operational visibility for remote delete failures
            console.warn('Failed to delete linked Linear issue; proceeding with local delete', error);
          }
        }
      }
    }
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: operational visibility for lookup failures
    console.warn('Failed to load linked Linear issue for deletion; proceeding with local delete', error);
  }

  return deleteStoryRecord(supabase, storyId);
}
