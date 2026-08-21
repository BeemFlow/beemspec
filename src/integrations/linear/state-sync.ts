import { mapLinearStateToStoryStatus, resolveLinearStateIdForStoryStatus } from '@beemspec/linear';
import type { StoryStatus } from '@beemspec/storymap';
import type { IssueSnapshot, IssueUpsertInput, SyncTarget } from '@beemspec/sync';

export async function applyStoryStatusToLinearInput(input: {
  issue: IssueUpsertInput;
  storyStatus: StoryStatus;
  target: SyncTarget;
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
  issue: Pick<IssueSnapshot, 'stateId' | 'stateName'>,
  target: SyncTarget,
): StoryStatus | null {
  return mapLinearStateToStoryStatus({
    stateId: issue.stateId,
    stateName: issue.stateName,
    statusMapping: target.statusMapping,
  });
}
