import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getLinearWorkspaceOptionsMock } = vi.hoisted(() => ({
  getLinearWorkspaceOptionsMock: vi.fn(),
}));

vi.mock('@beemspec/linear', () => ({
  getLinearWorkspaceOptions: getLinearWorkspaceOptionsMock,
}));

import { applySuggestedLinearSettings, resolveLinearOptions } from './discovery';

describe('linear discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes workspace options returned from Linear', async () => {
    getLinearWorkspaceOptionsMock.mockResolvedValue({
      organizationId: ' workspace-1 ',
      organizationName: ' BeemSpec ',
      teams: [{ id: 'team-1', name: 'Core', key: 'COR' }],
      projects: [],
      states: [],
    });

    await expect(resolveLinearOptions('access-1')).resolves.toEqual({
      workspaceId: 'workspace-1',
      workspaceName: 'BeemSpec',
      teams: [{ id: 'team-1', name: 'Core', key: 'COR' }],
      projects: [],
      states: [],
    });
  });

  it('suggests defaults when there is exactly one team and matching state names', () => {
    const result = applySuggestedLinearSettings(
      { linearWorkspaceId: null, linearTeamId: null, linearStatusMapping: null },
      {
        workspaceId: 'workspace-1',
        workspaceName: 'BeemSpec',
        teams: [{ id: 'team-1', name: 'Core', key: 'COR' }],
        projects: [],
        states: [
          { id: 'state-1', name: 'Backlog', type: null, teamId: 'team-1' },
          { id: 'state-2', name: 'Todo', type: 'unstarted', teamId: 'team-1' },
          { id: 'state-3', name: 'Review', type: null, teamId: 'team-1' },
          { id: 'state-4', name: 'Done', type: 'completed', teamId: 'team-1' },
        ],
      },
    );

    expect(result).toEqual({
      linearWorkspaceId: 'workspace-1',
      linearTeamId: 'team-1',
      linearStatusMapping: {
        backlog: 'state-1',
        todo: 'state-2',
        in_review: 'state-3',
        done: 'state-4',
      },
      changed: true,
    });
  });

  it('preserves explicit settings and only reports changes when normalized values differ', () => {
    const result = applySuggestedLinearSettings(
      {
        linearWorkspaceId: ' workspace-1 ',
        linearTeamId: 'team-2',
        linearStatusMapping: { done: ' state-done ', backlog: 'state-backlog' },
      },
      {
        workspaceId: 'workspace-1',
        workspaceName: 'BeemSpec',
        teams: [
          { id: 'team-1', name: 'Core', key: 'COR' },
          { id: 'team-2', name: 'Ops', key: 'OPS' },
        ],
        projects: [],
        states: [{ id: 'state-auto', name: 'Todo', type: 'unstarted', teamId: 'team-2' }],
      },
    );

    expect(result).toEqual({
      linearWorkspaceId: 'workspace-1',
      linearTeamId: 'team-2',
      linearStatusMapping: {
        todo: 'state-auto',
        done: 'state-done',
        backlog: 'state-backlog',
      },
      changed: true,
    });
  });
});
