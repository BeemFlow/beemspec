import { mapStoryToLinearIssueInput, resolveLinearStateIdForStoryStatus } from '@beemspec/linear';
import type { StoryStatus } from '@beemspec/storymap';
import { resolveLinearAuthTokenForTeam, resolveLinearSyncContextForStoryMap } from '@/integrations/linear/auth';
import { ensureLinearIssueHasLabel } from '@/integrations/linear/label-sync';
import { getStoryMapLinearImportSettings } from '@/integrations/linear/settings';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import { syncStoryToRemote } from '@/integrations/sync';
import type { Supabase } from '@/lib/supabase/types';
import { loadStoryWithStoryMap } from '@/storymap/story-context';

export async function processStoryLinearSyncById(
  supabase: Supabase,
  input: {
    storyId: string;
  },
) {
  const context = await loadStoryWithStoryMap(supabase, input.storyId);
  if (!context.ok) throw new Error(`Failed to load story: ${context.reason}`);

  const linearSyncContext = await resolveLinearSyncContextForStoryMap(supabase, {
    storyMapId: context.data.storyMapId,
  });

  if (!linearSyncContext.target || !linearSyncContext.targetConfigured) {
    throw new Error('No linear target configured for story map team');
  }

  if (!linearSyncContext.linearIssueSync) {
    throw new Error('Linear integration is not enabled');
  }

  const { story } = context.data;
  const existingLink = await getStoryLinearLink(supabase, input.storyId);
  const input_ = mapStoryToLinearIssueInput(story, linearSyncContext.target);
  const mappedStateId = linearSyncContext.target.statusMapping?.[story.status as StoryStatus];
  if (mappedStateId) input_.stateId = mappedStateId;

  const authToken = linearSyncContext.teamId ? await resolveLinearAuthTokenForTeam(linearSyncContext.teamId) : null;
  if (authToken) {
    try {
      const resolvedStateId = await resolveLinearStateIdForStoryStatus(
        authToken,
        linearSyncContext.target.teamId,
        story.status as StoryStatus,
        input_.stateId,
      );
      input_.stateId = resolvedStateId ?? undefined;
    } catch {
      // Best-effort state mapping; fallback stateId remains unchanged.
    }
  }

  const linearIssue = await syncStoryToRemote(
    linearSyncContext.linearIssueSync,
    input_,
    existingLink?.linearIssueId ?? null,
  );
  if (!linearIssue) throw new Error('Linear sync returned no issue snapshot');

  await upsertStoryLinearLink(supabase, {
    storyId: input.storyId,
    linearIssueId: linearIssue.id,
    linearIssueIdentifier: linearIssue.identifier,
    lastLocalUpdatedAt: null,
    lastLinearUpdatedAt: linearIssue.updatedAt,
  });

  if (linearSyncContext.teamId) {
    try {
      const importSettings = await getStoryMapLinearImportSettings(supabase, context.data.storyMapId);

      if (authToken) {
        await ensureLinearIssueHasLabel({
          authToken,
          issueId: linearIssue.id,
          teamId: linearSyncContext.target.teamId,
          labelName: importSettings.importLabelName,
        });
      }
    } catch {
      // best-effort label sync; primary story sync already succeeded
    }
  }

  return linearIssue;
}
