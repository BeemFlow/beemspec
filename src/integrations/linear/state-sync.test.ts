import { resolveLinearStateIdForStoryStatus } from '@beemspec/linear';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyStoryStatusToLinearInput, mapLinearIssueStateToStoryStatus } from './state-sync';

vi.mock('@beemspec/linear', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@beemspec/linear')>()),
  resolveLinearStateIdForStoryStatus: vi.fn(),
}));

describe('Linear state synchronization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('treats an explicit configured state as authoritative', async () => {
    const issue = { title: 'Story', description: '', teamId: 'linear-team' };

    await applyStoryStatusToLinearInput({
      issue,
      storyStatus: 'in_progress',
      target: { teamId: 'linear-team', statusMapping: { in_progress: 'configured-state' } },
      accessToken: 'token',
    });

    expect(issue).toMatchObject({ stateId: 'configured-state' });
    expect(resolveLinearStateIdForStoryStatus).not.toHaveBeenCalled();
  });

  it('uses workflow discovery only when no explicit mapping exists', async () => {
    vi.mocked(resolveLinearStateIdForStoryStatus).mockResolvedValue('discovered-state');
    const issue = { title: 'Story', description: '', teamId: 'linear-team' };

    await applyStoryStatusToLinearInput({
      issue,
      storyStatus: 'todo',
      target: { teamId: 'linear-team' },
      accessToken: 'token',
    });

    expect(issue).toMatchObject({ stateId: 'discovered-state' });
  });

  it('maps a remote state id through configured status mappings before its name heuristic', () => {
    expect(
      mapLinearIssueStateToStoryStatus(
        { stateId: 'configured-review', stateName: 'Done' },
        { teamId: 'linear-team', statusMapping: { in_review: 'configured-review' } },
      ),
    ).toBe('in_review');
  });
});
