/* @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamSettingsDialog } from './TeamSettingsDialog';

const { fetchJsonMock } = vi.hoisted(() => ({
  fetchJsonMock: vi.fn(),
}));

vi.mock('@/lib/http', () => ({
  fetchJson: fetchJsonMock,
}));

vi.mock('@/components/ui/settings-dialog', () => ({
  SettingsDialog: ({
    open,
    title,
    tabs,
    activeTab,
    onTabChange,
    error,
  }: {
    open: boolean;
    title: string;
    tabs: Array<{ value: string; label: string; content: React.ReactNode }>;
    activeTab: string;
    onTabChange: (value: string) => void;
    error?: string | null;
  }) =>
    open ? (
      <div>
        <h1>{title}</h1>
        {tabs.map((tab) => (
          <button key={tab.value} type="button" onClick={() => onTabChange(tab.value)}>
            {tab.label}
          </button>
        ))}
        {error ? <p>{error}</p> : null}
        <div>{tabs.find((tab) => tab.value === activeTab)?.content}</div>
      </div>
    ) : null,
}));

vi.mock('@/components/ui/delete-button', () => ({
  DeleteButton: ({
    onDelete,
    label,
    confirmDescription,
    disabled,
  }: {
    onDelete: () => void;
    label?: string;
    confirmDescription?: string;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onDelete} disabled={disabled}>
      {label ?? confirmDescription ?? 'Delete'}
    </button>
  ),
}));

function createSettingsPayload(overrides: Record<string, unknown> = {}) {
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
      {
        id: 'member-2',
        user_id: 'user-2',
        role: 'member',
        email: 'member@example.com',
        created_at: '2026-01-02T00:00:00Z',
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

describe('TeamSettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('integrates the real hook to rename a team and invite a member', async () => {
    const user = userEvent.setup();
    const onTeamUpdated = vi.fn().mockResolvedValue(undefined);

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
              created_at: '2026-01-03T00:00:00Z',
              accepted_at: null,
            },
          ],
        }),
      );

    render(
      <TeamSettingsDialog
        open
        onOpenChange={vi.fn()}
        team={{ id: 'team-1', name: 'Alpha', role: 'owner', created_at: '', updated_at: '' }}
        onTeamUpdated={onTeamUpdated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Alpha')).toBeTruthy();
    });

    await user.clear(screen.getByLabelText('Team name'));
    await user.type(screen.getByLabelText('Team name'), 'Alpha Prime');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        '/api/teams/team-1',
        expect.objectContaining({ method: 'PUT', body: JSON.stringify({ name: 'Alpha Prime' }) }),
        'Failed to rename team',
      );
    });
    expect(onTeamUpdated).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Members' }));
    await user.type(screen.getByPlaceholderText('Email address'), 'invitee@example.com');
    await user.click(screen.getByRole('button', { name: '' }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        '/api/teams/team-1/invites',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'invitee@example.com' }),
        }),
        'Failed to invite user',
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Invitation sent')).toBeTruthy();
      expect(screen.getByText('Pending Invites')).toBeTruthy();
      expect(screen.getByText('invitee@example.com')).toBeTruthy();
    });
  });

  it('integrates the real hook to cancel invites and remove members', async () => {
    const user = userEvent.setup();

    fetchJsonMock
      .mockResolvedValueOnce(
        createSettingsPayload({
          invites: [
            {
              id: 'invite-1',
              team_id: 'team-1',
              email: 'invitee@example.com',
              invited_by: 'user-1',
              created_at: '2026-01-03T00:00:00Z',
              accepted_at: null,
            },
          ],
        }),
      )
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(createSettingsPayload())
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce(
        createSettingsPayload({
          members: [
            {
              id: 'member-1',
              user_id: 'user-1',
              role: 'owner',
              email: 'owner@example.com',
              created_at: '2026-01-01T00:00:00Z',
            },
          ],
        }),
      );

    render(
      <TeamSettingsDialog
        open
        onOpenChange={vi.fn()}
        team={{ id: 'team-1', name: 'Alpha', role: 'owner', created_at: '', updated_at: '' }}
        onTeamUpdated={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Members' }));

    await waitFor(() => {
      expect(screen.getByText('invitee@example.com')).toBeTruthy();
      expect(screen.getByText('member@example.com')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'The invitation to invitee@example.com will be cancelled.' }));
    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        '/api/teams/team-1/invites/invite-1',
        { method: 'DELETE' },
        'Failed to cancel invite',
      );
    });

    await waitFor(() => {
      expect(screen.queryByText('invitee@example.com')).toBeNull();
    });

    await user.click(screen.getByRole('button', { name: 'Remove member@example.com' }));
    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        '/api/teams/team-1/members/user-2',
        { method: 'DELETE' },
        'Failed to remove member',
      );
    });

    await waitFor(() => {
      expect(screen.queryByText('member@example.com')).toBeNull();
    });
  });

  it('lets owners promote and remove another owner while protecting the last owner', async () => {
    const user = userEvent.setup();
    const onTeamUpdated = vi.fn().mockResolvedValue(undefined);

    fetchJsonMock
      .mockResolvedValueOnce(createSettingsPayload())
      .mockResolvedValueOnce({ success: true, role: 'owner' })
      .mockResolvedValueOnce(
        createSettingsPayload({
          members: [createSettingsPayload().members[0], { ...createSettingsPayload().members[1], role: 'owner' }],
        }),
      )
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(
        createSettingsPayload({
          members: [createSettingsPayload().members[0]],
        }),
      );

    render(
      <TeamSettingsDialog
        open
        onOpenChange={vi.fn()}
        team={{ id: 'team-1', name: 'Alpha', role: 'owner', created_at: '', updated_at: '' }}
        onTeamUpdated={onTeamUpdated}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Members' }));
    const memberRole = await screen.findByRole('combobox', { name: 'Role for member@example.com' });
    memberRole.focus();
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('option', { name: 'Owner' }));

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        '/api/teams/team-1/members/user-2',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'owner' }) }),
        'Failed to update member role',
      );
    });

    const removeOwner = await screen.findByRole('button', { name: 'Remove member@example.com' });
    expect((removeOwner as HTMLButtonElement).disabled).toBe(false);
    await user.click(removeOwner);

    await waitFor(() => {
      expect(fetchJsonMock).toHaveBeenCalledWith(
        '/api/teams/team-1/members/user-2',
        { method: 'DELETE' },
        'Failed to remove member',
      );
    });
    expect((screen.getByRole('button', { name: 'Remove owner@example.com' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onTeamUpdated).toHaveBeenCalledTimes(2);
  });

  it('shows non-owner restrictions through the rendered dialog', async () => {
    const user = userEvent.setup();
    fetchJsonMock.mockResolvedValueOnce(
      createSettingsPayload({
        role: 'member',
        permissions: { is_owner: false },
        members: [],
      }),
    );

    render(
      <TeamSettingsDialog
        open
        onOpenChange={vi.fn()}
        team={{ id: 'team-1', name: 'Alpha', role: 'member', created_at: '', updated_at: '' }}
        onTeamUpdated={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Only team owners can rename the team.')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: 'Members' }));
    expect(screen.queryByPlaceholderText('Email address')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Remove / })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Danger' }));
    expect(screen.getByText('Only team owners can delete a team.')).toBeTruthy();
  });
});
