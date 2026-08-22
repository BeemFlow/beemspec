import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pushStoryToLinearById } from './story-sync';

vi.mock('@/integrations/linear/adapter', () => ({
  mapStoryToLinearIssueInput: vi.fn(),
  resolveLinearStateIdForStoryStatus: vi.fn(),
  syncStoryToRemote: vi.fn(),
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

vi.mock('@/integrations/linear/settings', () => ({
  getStoryMapLinearImportSettings: vi.fn(),
}));

vi.mock('@/integrations/linear/adapter/labels', () => ({
  ensureLinearIssueHasLabel: vi.fn(),
}));

import {
  mapStoryToLinearIssueInput,
  resolveLinearStateIdForStoryStatus,
  syncStoryToRemote,
} from '@/integrations/linear/adapter';
import { ensureLinearIssueHasLabel } from '@/integrations/linear/adapter/labels';
import { resolveLinearAuthTokenForTeam, resolveLinearSyncContextForStoryMap } from '@/integrations/linear/auth';
import { getStoryMapLinearImportSettings } from '@/integrations/linear/settings';
import { getStoryLinearLink, upsertStoryLinearLink } from '@/integrations/linear/story-links';
import { loadStoryWithStoryMap } from '@/storymap/story-context';

describe('pushStoryToLinearById', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(loadStoryWithStoryMap).mockResolvedValue({
      ok: true,
      data: {
        storyMapId: 'map_1',
        story: {
          id: 'story_1',
          title: 'Story',
          content: { _version: 1, user_story: 'r', acceptance_criteria: 'a' },
          status: 'todo',
          updated_at: '2026-03-06T00:00:00.000Z',
        },
      },
    } as never);

    vi.mocked(resolveLinearSyncContextForStoryMap).mockResolvedValue({
      status: 'ready',
      teamId: 'team_1',
      targetConfigured: true,
      target: { teamId: 'linear_team_1', statusMapping: { todo: 'mapped_state_todo' } },
      linearIssueSync: { createIssue: vi.fn(), getIssueById: vi.fn(), updateIssue: vi.fn(), deleteIssue: vi.fn() },
      accessToken: 'token_1',
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
    await pushStoryToLinearById({} as never, { storyId: 'story_1' });

    expect(resolveLinearStateIdForStoryStatus).not.toHaveBeenCalled();
    expect(syncStoryToRemote).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ stateId: 'mapped_state_todo' }),
      null,
    );
    expect(upsertStoryLinearLink).toHaveBeenCalled();
    expect(upsertStoryLinearLink).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lastLocalUpdatedAt: '2026-03-06T00:00:00.000Z' }),
    );
    expect(resolveLinearAuthTokenForTeam).not.toHaveBeenCalled();
    expect(ensureLinearIssueHasLabel).toHaveBeenCalledWith({
      authToken: 'token_1',
      issueId: 'lin_1',
      teamId: 'linear_team_1',
      labelName: 'Story',
    });
  });

  it('does not fail story sync when label apply fails', async () => {
    vi.mocked(ensureLinearIssueHasLabel).mockRejectedValue(new Error('label apply failed'));

    await expect(pushStoryToLinearById({} as never, { storyId: 'story_1' })).resolves.toMatchObject({
      id: 'lin_1',
      identifier: 'BEE-1',
    });

    expect(upsertStoryLinearLink).toHaveBeenCalled();
  });

  it('preserves unknown remote markdown sections when updating an existing linked issue', async () => {
    vi.mocked(getStoryLinearLink).mockResolvedValue({ linearIssueId: 'lin_existing' } as never);
    vi.mocked(resolveLinearSyncContextForStoryMap).mockResolvedValue({
      status: 'ready',
      teamId: 'team_1',
      targetConfigured: true,
      target: { teamId: 'linear_team_1', statusMapping: { todo: 'mapped_state_todo' } },
      linearIssueSync: {
        createIssue: vi.fn(),
        getIssueById: vi.fn().mockResolvedValue({
          id: 'lin_existing',
          identifier: 'BEE-9',
          title: 'Story',
          description: '## QA Notes\nKeep this section',
          stateId: null,
          updatedAt: '2026-03-05T00:00:00.000Z',
        }),
        updateIssue: vi.fn(),
        deleteIssue: vi.fn(),
      },
      accessToken: 'token_1',
    });

    await pushStoryToLinearById({} as never, { storyId: 'story_1' });

    expect(mapStoryToLinearIssueInput).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ preserveFromDescription: '## QA Notes\nKeep this section' }),
    );
    expect(syncStoryToRemote).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'lin_existing');
  });

  it('aborts an update when the existing description cannot be loaded safely', async () => {
    vi.mocked(getStoryLinearLink).mockResolvedValue({ linearIssueId: 'lin_existing' } as never);
    vi.mocked(resolveLinearSyncContextForStoryMap).mockResolvedValue({
      status: 'ready',
      teamId: 'team_1',
      targetConfigured: true,
      target: { teamId: 'linear_team_1' },
      linearIssueSync: {
        createIssue: vi.fn(),
        getIssueById: vi.fn().mockRejectedValue(new Error('Linear unavailable')),
        updateIssue: vi.fn(),
        deleteIssue: vi.fn(),
      },
      accessToken: 'token_1',
    });

    await expect(pushStoryToLinearById({} as never, { storyId: 'story_1' })).rejects.toThrow('Linear unavailable');
    expect(syncStoryToRemote).not.toHaveBeenCalled();
  });

  it('recovers an issue created before a missing link write by deterministic story id', async () => {
    const getIssueById = vi.fn().mockResolvedValue({
      id: 'story_1',
      identifier: 'BEE-10',
      title: 'Story',
      description: 'Existing description',
      stateId: null,
      updatedAt: '2026-03-05T00:00:00.000Z',
    });
    vi.mocked(resolveLinearSyncContextForStoryMap).mockResolvedValue({
      status: 'ready',
      teamId: 'team_1',
      targetConfigured: true,
      target: { teamId: 'linear_team_1' },
      linearIssueSync: { createIssue: vi.fn(), getIssueById, updateIssue: vi.fn(), deleteIssue: vi.fn() },
      accessToken: 'token_1',
    });

    await pushStoryToLinearById({} as never, { storyId: 'story_1', recoverDeterministicCreate: true });

    expect(getIssueById).toHaveBeenCalledWith('story_1');
    expect(syncStoryToRemote).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'story_1');
  });
});
