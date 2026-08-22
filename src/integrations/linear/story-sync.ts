import { buildStoryPatchFromLinearIssue, mapStoryToLinearIssueInput } from '@beemspec/linear';
import type { StoryContent, StoryStatus } from '@beemspec/storymap';
import {
  buildDbUpdateFromPatch,
  hasMutableStoryFields,
  type IssueSnapshot,
  type SyncTarget,
  syncStoryToRemote,
} from '@beemspec/sync';
import {
  type LinearSyncContext,
  resolveLinearAuthTokenForTeam,
  resolveLinearSyncContextForStoryMap,
} from '@/integrations/linear/auth';
import { ensureLinearIssueHasLabel } from '@/integrations/linear/label-sync';
import { getStoryMapLinearImportSettings } from '@/integrations/linear/settings';
import { applyStoryStatusToLinearInput, mapLinearIssueStateToStoryStatus } from '@/integrations/linear/state-sync';
import { getStoryLinearLink, type StoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import type { Supabase } from '@/lib/supabase/types';
import { loadStoryWithStoryMap } from '@/storymap/story-context';
import type { Story } from '@/types';

type StoryForLinearSync = Story & { updated_at: string };

export interface LinearIssueForWriteback {
  id: string;
  identifier: string | null;
  title: string | null;
  description: string | null;
  stateId: string | null;
  stateName?: string | null;
  updatedAt: string;
}

interface WebhookReceipt {
  idempotencyKey: string;
  type: string;
  action: string;
  payload: unknown;
}

export interface LinearIssueWritebackResult {
  applied: boolean;
  conflict: boolean;
  duplicate: boolean;
  ignoredReason?: 'no_mutable_fields';
}

function requireReadyContext(context: LinearSyncContext): asserts context is LinearSyncContext & {
  target: SyncTarget;
  linearIssueSync: NonNullable<LinearSyncContext['linearIssueSync']>;
} {
  if (context.status === 'error') {
    throw new Error('Failed to resolve Linear sync context', { cause: context.error });
  }
  if (!context.target || !context.targetConfigured) {
    throw new Error('No linear target configured for story map team');
  }
  if (!context.linearIssueSync) {
    throw new Error(
      context.status === 'auth_unavailable'
        ? 'Linear authorization is unavailable or expired'
        : 'Linear integration is not connected',
    );
  }
}

export async function pushStoryToLinear(
  supabase: Supabase,
  input: {
    story: StoryForLinearSync;
    storyMapId: string;
    context: LinearSyncContext;
    link: StoryLinearLink | null;
    remote?: IssueSnapshot | null;
    recoverDeterministicCreate?: boolean;
  },
): Promise<IssueSnapshot> {
  requireReadyContext(input.context);

  let existingIssueId = input.link?.linearIssueId ?? null;
  let remote = input.remote ?? null;

  if (!existingIssueId && input.recoverDeterministicCreate) {
    remote = await input.context.linearIssueSync.getIssueById(input.story.id);
    existingIssueId = remote?.id ?? null;
  }

  if (existingIssueId) {
    remote ??= await input.context.linearIssueSync.getIssueById(existingIssueId);
    if (!remote) throw new Error('Linked Linear issue was not found');
  }

  const linearInput = mapStoryToLinearIssueInput(input.story, input.context.target, {
    preserveFromDescription: remote?.description ?? null,
  });
  const authToken =
    input.context.accessToken ??
    (input.context.teamId ? await resolveLinearAuthTokenForTeam(input.context.teamId) : null);
  await applyStoryStatusToLinearInput({
    issue: linearInput,
    storyStatus: input.story.status as StoryStatus,
    target: input.context.target,
    accessToken: authToken,
  });

  const linearIssue = await syncStoryToRemote(input.context.linearIssueSync, linearInput, existingIssueId);
  if (!linearIssue) throw new Error('Linear sync returned no issue snapshot');

  await upsertStoryLinearLink(supabase, {
    storyId: input.story.id,
    linearIssueId: linearIssue.id,
    linearIssueIdentifier: linearIssue.identifier,
    lastLocalUpdatedAt: input.story.updated_at,
    lastLinearUpdatedAt: linearIssue.updatedAt,
  });

  if (input.context.teamId && !input.link) {
    try {
      const importSettings = await getStoryMapLinearImportSettings(supabase, input.storyMapId);
      if (authToken) {
        await ensureLinearIssueHasLabel({
          authToken,
          issueId: linearIssue.id,
          teamId: input.context.target.teamId,
          labelName: importSettings.importLabelName,
        });
      }
    } catch {
      // Labeling is best effort; the primary story sync has already succeeded.
    }
  }

  return linearIssue;
}

export async function pushStoryToLinearById(
  supabase: Supabase,
  input: { storyId: string; recoverDeterministicCreate?: boolean },
): Promise<IssueSnapshot> {
  const storyContext = await loadStoryWithStoryMap(supabase, input.storyId);
  if (!storyContext.ok) throw new Error(`Failed to load story: ${storyContext.reason}`);

  const [context, link] = await Promise.all([
    resolveLinearSyncContextForStoryMap(supabase, { storyMapId: storyContext.data.storyMapId }),
    getStoryLinearLink(supabase, input.storyId),
  ]);

  return pushStoryToLinear(supabase, {
    story: storyContext.data.story,
    storyMapId: storyContext.data.storyMapId,
    context,
    link,
    recoverDeterministicCreate: input.recoverDeterministicCreate,
  });
}

export async function applyLinearIssueToStory(
  supabase: Supabase,
  input: {
    story: { id: string; updated_at: string; content?: StoryContent | null };
    issue: LinearIssueForWriteback;
    target?: SyncTarget | null;
    receipt?: WebhookReceipt;
  },
): Promise<LinearIssueWritebackResult> {
  const patch = buildStoryPatchFromLinearIssue({
    title: input.issue.title,
    description: input.issue.description,
    stateName: input.issue.stateName ?? null,
    updatedAt: input.issue.updatedAt,
  });
  if (input.target) {
    const mappedStatus = mapLinearIssueStateToStoryStatus(input.issue, input.target);
    if (mappedStatus) patch.status = mappedStatus;
  }

  if (!hasMutableStoryFields(patch)) {
    return { applied: false, conflict: false, duplicate: false, ignoredReason: 'no_mutable_fields' };
  }

  const dbUpdate = buildDbUpdateFromPatch(patch, input.story.content ?? null);
  const writeback = {
    p_story_id: input.story.id,
    p_linear_issue_id: input.issue.id,
    p_linear_issue_identifier: input.issue.identifier,
    p_expected_story_updated_at: input.story.updated_at,
    p_last_linear_updated_at: input.issue.updatedAt,
    p_story_title: typeof dbUpdate.title === 'string' ? dbUpdate.title : null,
    p_story_status: typeof dbUpdate.status === 'string' ? dbUpdate.status : null,
    p_story_content:
      dbUpdate.content && typeof dbUpdate.content === 'object' ? (dbUpdate.content as Record<string, unknown>) : null,
  };

  if (input.receipt) {
    const { data, error } = await supabase
      .rpc('apply_linear_issue_writeback_with_receipt', {
        ...writeback,
        p_idempotency_key: input.receipt.idempotencyKey,
        p_event_type: input.receipt.type,
        p_event_action: input.receipt.action,
        p_payload: input.receipt.payload,
      })
      .single<{ duplicate: boolean; applied: boolean; conflict: boolean }>();
    if (error) throw error;
    if (!data) throw new Error('Linear webhook writeback returned no result');
    return {
      applied: data.applied,
      conflict: data.conflict,
      duplicate: data.duplicate,
    };
  }

  const { data, error } = await supabase
    .rpc('apply_linear_issue_writeback', writeback)
    .single<{ applied: boolean; conflict: boolean }>();
  if (error) throw error;
  if (!data) throw new Error('Linear writeback returned no result');
  return {
    applied: data.applied,
    conflict: data.conflict,
    duplicate: false,
  };
}
