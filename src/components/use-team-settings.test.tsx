/* @vitest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTeamSettings } from './use-team-settings';

const { fetchJsonMock } = vi.hoisted(() => ({
  fetchJsonMock: vi.fn(),
}));

vi.mock('@/lib/http', () => ({
  fetchJson: fetchJsonMock,
}));

function createSettingsPayload(overrides?: Partial<Record<string, unknown>>) {
  return {
    team_id: 'team-1',
    role: 'owner',
    permissions: { is_owner: true },
    members: [
      {
        id: 'member-1',
        user_id: 'user-1',
        role: 'owner',
        email: 'owner@example.com',
        created_at: '2026-01-01T00:00:00Z',
      },
    ],
    invites: [],
    linear: {
      settings: null,
      connection: { connected: false, expires_at: null, scope: null },
    },
    ...overrides,
  };
}

describe('useTeamSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', 'http://localhost:3000/dashboard?foo=bar');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads team settings, renames the team, and invites a user through real request flows', async () => {
    const onTeamUpdated = vi.fn().mockResolvedValue(undefined);
    const resolveLinearOAuthStatus = vi.fn(
      (input: { status: 'success' | 'error'; reason?: string }) =>
        ({ type: input.status, message: input.reason ?? input.status }) as const,
    );
    fetchJsonMock
      .mockResolvedValueOnce(createSettingsPayload())
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ status: 'invited' })
      .mockResolvedValueOnce(
        createSettingsPayload({
          invites: [
            {
              id: 'invite-1',
              team_id: 'team-1',
              email: 'invitee@example.com',
              invited_by: 'user-1',
              created_at: '2026-01-02T00:00:00Z',
              accepted_at: null,
            },
          ],
        }),
      );

    const { result } = renderHook(() =>
      useTeamSettings({
        open: true,
        teamId: 'team-1',
        teamName: 'Alpha',
        isOwner: true,
        onTeamUpdated,
        onOpenChange: vi.fn(),
        resolveLinearOAuthStatus,
      }),
    );

    await waitFor(() => {
      expect(result.current.members).toHaveLength(1);
    });

    act(() => {
      result.current.setName('  Alpha Prime  ');
    });
    await act(async () => {
      await result.current.handleRename({ preventDefault() {} } as React.FormEvent);
    });

    expect(fetchJsonMock).toHaveBeenCalledWith(
      '/api/teams/team-1',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ name: 'Alpha Prime' }) }),
      'Failed to rename team',
    );
    expect(onTeamUpdated).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.setInviteEmail(' invitee@example.com ');
    });
    await act(async () => {
      await result.current.handleInvite({ preventDefault() {} } as React.FormEvent);
    });

    expect(fetchJsonMock).toHaveBeenCalledWith(
      '/api/teams/team-1/invites',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'invitee@example.com' }),
      }),
      'Failed to invite user',
    );
    expect(result.current.inviteEmail).toBe('');
    expect(result.current.inviteStatus).toEqual({ type: 'success', message: 'Invitation sent' });
    expect(result.current.invites).toHaveLength(1);
  });

  it('loads Linear options for a connected owner and filters status mappings when the team changes', async () => {
    const resolveLinearOAuthStatus = vi.fn(() => ({ type: 'success', message: 'OAuth connected' }) as const);
    fetchJsonMock
      .mockResolvedValueOnce(
        createSettingsPayload({
          linear: {
            settings: {
              team_id: 'team-1',
              linear_workspace_id: 'workspace-1',
              linear_team_id: 'linear-team-a',
              linear_status_mapping: { backlog: 'state-a-1', done: 'state-b-1' },
              updated_at: '2026-01-01T00:00:00Z',
            },
            connection: { connected: true, expires_at: null, scope: 'read,write' },
          },
        }),
      )
      .mockResolvedValueOnce({
        connected: true,
        settings: {
          team_id: 'team-1',
          linear_workspace_id: 'workspace-1',
          linear_team_id: 'linear-team-a',
          linear_status_mapping: { backlog: 'state-a-1', done: 'state-b-1' },
          updated_at: '2026-01-01T00:00:00Z',
        },
        options: {
          workspace_id: 'workspace-1',
          workspace_name: 'BeemSpec',
          teams: [
            { id: 'linear-team-a', name: 'Core', key: 'COR' },
            { id: 'linear-team-b', name: 'Ops', key: 'OPS' },
          ],
          projects: [],
          states: [
            { id: 'state-a-1', name: 'Todo', type: 'unstarted', teamId: 'linear-team-a' },
            { id: 'state-b-1', name: 'Done', type: 'completed', teamId: 'linear-team-b' },
          ],
        },
        applied_defaults: false,
      });

    const { result } = renderHook(() =>
      useTeamSettings({
        open: true,
        teamId: 'team-1',
        teamName: 'Alpha',
        isOwner: true,
        onTeamUpdated: vi.fn().mockResolvedValue(undefined),
        onOpenChange: vi.fn(),
        resolveLinearOAuthStatus,
      }),
    );

    await waitFor(() => {
      expect(result.current.linearConnected).toBe(true);
    });

    act(() => {
      result.current.setActiveTab('integrations');
    });

    await waitFor(() => {
      expect(result.current.linearTeamOptions).toHaveLength(2);
    });

    expect(result.current.linearWorkspaceName).toBe('BeemSpec');

    act(() => {
      result.current.setLinearTeamId('linear-team-b');
    });

    expect(result.current.linearTeamId).toBe('linear-team-b');
    expect(result.current.linearStatusMapping).toEqual({ done: 'state-b-1' });
  });

  it('disconnects Linear, reloads settings, and deletes the team through real boundary calls', async () => {
    const onTeamUpdated = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    const resolveLinearOAuthStatus = vi.fn(
      (input: { status: 'success' | 'error'; reason?: string }) =>
        ({ type: input.status, message: input.reason ?? input.status }) as const,
    );
    fetchJsonMock
      .mockResolvedValueOnce(
        createSettingsPayload({
          linear: {
            settings: {
              team_id: 'team-1',
              linear_workspace_id: 'workspace-1',
              linear_team_id: 'linear-team-a',
              linear_status_mapping: { backlog: 'state-a-1' },
              updated_at: '2026-01-01T00:00:00Z',
            },
            connection: { connected: true, expires_at: '2026-02-01T00:00:00Z', scope: 'read,write' },
          },
        }),
      )
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(createSettingsPayload())
      .mockResolvedValueOnce({});

    const { result } = renderHook(() =>
      useTeamSettings({
        open: true,
        teamId: 'team-1',
        teamName: 'Alpha',
        isOwner: true,
        onTeamUpdated,
        onOpenChange,
        resolveLinearOAuthStatus,
      }),
    );

    await waitFor(() => {
      expect(result.current.linearConnected).toBe(true);
    });

    await act(async () => {
      await result.current.handleDisconnectLinear();
    });

    expect(fetchJsonMock).toHaveBeenCalledWith(
      '/api/integrations/linear/oauth/connection?team_id=team-1',
      { method: 'DELETE' },
      'Failed to disconnect Linear',
    );
    expect(result.current.linearConnected).toBe(false);
    expect(result.current.linearStatus).toEqual({ type: 'success', message: 'Linear disconnected' });

    await act(async () => {
      await result.current.handleDeleteTeam();
    });

    expect(fetchJsonMock).toHaveBeenCalledWith('/api/teams/team-1', { method: 'DELETE' }, 'Failed to delete team');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onTeamUpdated).toHaveBeenCalledTimes(1);
  });
});
