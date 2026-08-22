import type { StoryStatus } from '@/domain/story-map';
import type { LinearIssueSnapshot, LinearIssueUpsertInput, LinearSyncTarget } from '@/integrations/linear/adapter';
import { mapLinearStateToStoryStatus, resolveLinearStateIdForStoryStatus } from '@/integrations/linear/adapter';

export async function applyStoryStatusToLinearInput(input: {
  issue: LinearIssueUpsertInput;
  storyStatus: StoryStatus;
  target: LinearSyncTarget;
  accessToken?: string | null;
}): Promise<void> {
  const configuredStateId = input.target.statusMapping?.[input.storyStatus];
  if (configuredStateId) {
    input.issue.stateId = configuredStateId;
    return;
  }

  if (!input.accessToken) return;

  try {
    const resolvedStateId = await resolveLinearStateIdForStoryStatus(
      input.accessToken,
      input.target.teamId,
      input.storyStatus,
    );
    input.issue.stateId = resolvedStateId ?? undefined;
  } catch {
    // A workflow may be temporarily unavailable. The issue can still sync and
    // a later story edit or manual reconciliation can fill the state.
  }
}

export function mapLinearIssueStateToStoryStatus(
  issue: Pick<LinearIssueSnapshot, 'stateId' | 'stateName'>,
  target: LinearSyncTarget,
): StoryStatus | null {
  return mapLinearStateToStoryStatus({
    stateId: issue.stateId,
    stateName: issue.stateName,
    statusMapping: target.statusMapping,
  });
}
