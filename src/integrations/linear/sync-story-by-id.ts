import { mapStoryToLinearIssueInput } from '@beemspec/linear';
import type { StoryStatus } from '@beemspec/storymap';
import { syncStoryToRemote } from '@beemspec/sync';
import { resolveLinearAuthTokenForTeam, resolveLinearSyncContextForStoryMap } from '@/integrations/linear/auth';
import { ensureLinearIssueHasLabel } from '@/integrations/linear/label-sync';
import { getStoryMapLinearImportSettings } from '@/integrations/linear/settings';
import { applyStoryStatusToLinearInput } from '@/integrations/linear/state-sync';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import type { Supabase } from '@/lib/supabase/types';
import { loadStoryWithStoryMap } from '@/storymap/story-context';

export async function processStoryLinearSyncById(
  supabase: Supabase,
  input: {
    storyId: string;
    recoverDeterministicCreate?: boolean;
  },
) {
  const context = await loadStoryWithStoryMap(supabase, input.storyId);
  if (!context.ok) throw new Error(`Failed to load story: ${context.reason}`);

  const linearSyncContext = await resolveLinearSyncContextForStoryMap(supabase, {
    storyMapId: context.data.storyMapId,
  });

  if (linearSyncContext.status === 'error') {
    throw new Error('Failed to resolve Linear sync context', { cause: linearSyncContext.error });
  }

  if (!linearSyncContext.target || !linearSyncContext.targetConfigured) {
    throw new Error('No linear target configured for story map team');
  }

  if (!linearSyncContext.linearIssueSync) {
    throw new Error(
      linearSyncContext.status === 'auth_unavailable'
        ? 'Linear authorization is unavailable or expired'
        : 'Linear integration is not connected',
    );
  }

  const { story } = context.data;
  const existingLink = await getStoryLinearLink(supabase, input.storyId);
  let existingIssueId = existingLink?.linearIssueId ?? null;
  let preserveFromDescription: string | null = null;
  let remote = null;

  if (!existingIssueId && input.recoverDeterministicCreate) {
    remote = await linearSyncContext.linearIssueSync.getIssueById(story.id);
    existingIssueId = remote?.id ?? null;
  }

  if (existingIssueId) {
    remote ??= await linearSyncContext.linearIssueSync.getIssueById(existingIssueId);
    if (!remote) throw new Error('Linked Linear issue was not found');
    preserveFromDescription = remote.description;
  }

  const input_ = mapStoryToLinearIssueInput(story, linearSyncContext.target, {
    preserveFromDescription,
  });
  const authToken =
    linearSyncContext.accessToken ??
    (linearSyncContext.teamId ? await resolveLinearAuthTokenForTeam(linearSyncContext.teamId) : null);
  await applyStoryStatusToLinearInput({
    issue: input_,
    storyStatus: story.status as StoryStatus,
    target: linearSyncContext.target,
    accessToken: authToken,
  });

  const linearIssue = await syncStoryToRemote(linearSyncContext.linearIssueSync, input_, existingIssueId);
  if (!linearIssue) throw new Error('Linear sync returned no issue snapshot');

  await upsertStoryLinearLink(supabase, {
    storyId: input.storyId,
    linearIssueId: linearIssue.id,
    linearIssueIdentifier: linearIssue.identifier,
    lastLocalUpdatedAt: story.updated_at ?? null,
    lastLinearUpdatedAt: linearIssue.updatedAt,
  });

  if (linearSyncContext.teamId && !existingLink) {
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
