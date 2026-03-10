import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processStoryLinearSyncById } from './sync-story-by-id';

vi.mock('@beemspec/linear', () => ({
  mapStoryToLinearIssueInput: vi.fn(),
  resolveLinearStateIdForStoryStatus: vi.fn(),
}));

vi.mock('@/storymap/story-context', () => ({
  loadStoryWithStoryMap: vi.fn(),
}));

vi.mock('@/integrations/linear/auth', () => ({
  resolveLinearSyncContextForStoryMap: vi.fn(),
  resolveLinearAuthTokenForTeam: vi.fn(),
}));

vi.mock('@/integrations/linear/story-links', () => ({
  getStoryLinearLink: vi.fn(),
  upsertStoryLinearLink: vi.fn(),
}));

vi.mock('@/integrations/sync', () => ({
  syncStoryToRemote: vi.fn(),
}));

vi.mock('@/integrations/linear/settings', () => ({
  getStoryMapLinearImportSettings: vi.fn(),
}));

vi.mock('@/integrations/linear/label-sync', () => ({
  ensureLinearIssueHasLabel: vi.fn(),
}));

import { mapStoryToLinearIssueInput, resolveLinearStateIdForStoryStatus } from '@beemspec/linear';
import { resolveLinearAuthTokenForTeam, resolveLinearSyncContextForStoryMap } from '@/integrations/linear/auth';
import { ensureLinearIssueHasLabel } from '@/integrations/linear/label-sync';
import { getStoryMapLinearImportSettings } from '@/integrations/linear/settings';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import { syncStoryToRemote } from '@/integrations/sync';
import { loadStoryWithStoryMap } from '@/storymap/story-context';

describe('processStoryLinearSyncById', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(loadStoryWithStoryMap).mockResolvedValue({
      ok: true,
      data: {
        storyMapId: 'map_1',
        story: {
          id: 'story_1',
          title: 'Story',
          content: { _version: 1, requirements: 'r', acceptance_criteria: 'a' },
          status: 'todo',
        },
      },
    } as never);

    vi.mocked(resolveLinearSyncContextForStoryMap).mockResolvedValue({
      teamId: 'team_1',
      targetConfigured: true,
      target: { teamId: 'linear_team_1', statusMapping: { todo: 'mapped_state_todo' } },
      linearIssueSync: { createIssue: vi.fn(), getIssueById: vi.fn(), updateIssue: vi.fn(), deleteIssue: vi.fn() },
    });

    vi.mocked(getStoryLinearLink).mockResolvedValue(null);
    vi.mocked(mapStoryToLinearIssueInput).mockReturnValue({
      title: 'Story',
      description: 'desc',
      teamId: 'linear_team_1',
    });
    vi.mocked(resolveLinearStateIdForStoryStatus).mockResolvedValue('resolved_state');
    vi.mocked(syncStoryToRemote).mockResolvedValue({
      id: 'lin_1',
      identifier: 'BEE-1',
      title: 'Story',
      description: null,
      stateId: null,
      updatedAt: '2026-03-06T00:00:00.000Z',
    });

    vi.mocked(resolveLinearAuthTokenForTeam).mockResolvedValue('token_1');
    vi.mocked(getStoryMapLinearImportSettings).mockResolvedValue({
      autoImportLabeledIssues: true,
      importLabelName: 'Story',
    });
  });

  it('applies sync label after successful remote sync', async () => {
    await processStoryLinearSyncById({} as never, { storyId: 'story_1' });

    expect(resolveLinearStateIdForStoryStatus).toHaveBeenCalledWith(
      'token_1',
      'linear_team_1',
      'todo',
      'mapped_state_todo',
    );
    expect(syncStoryToRemote).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ stateId: 'resolved_state' }),
      null,
    );
    expect(upsertStoryLinearLink).toHaveBeenCalled();
    expect(ensureLinearIssueHasLabel).toHaveBeenCalledWith({
      authToken: 'token_1',
      issueId: 'lin_1',
      teamId: 'linear_team_1',
      labelName: 'Story',
    });
  });

  it('does not fail story sync when label apply fails', async () => {
    vi.mocked(ensureLinearIssueHasLabel).mockRejectedValue(new Error('label apply failed'));

    await expect(processStoryLinearSyncById({} as never, { storyId: 'story_1' })).resolves.toMatchObject({
      id: 'lin_1',
      identifier: 'BEE-1',
    });

    expect(upsertStoryLinearLink).toHaveBeenCalled();
  });
});
