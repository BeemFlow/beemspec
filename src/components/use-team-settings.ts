import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '@/lib/errors';
import { fetchJson } from '@/lib/http';
import type { TeamInvite, TeamMember } from '@/types';

export type SettingsTab = 'general' | 'integrations' | 'members' | 'danger';

export type InviteStatus =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

export type LinearStatus =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

interface LinearIntegrationSettings {
  team_id: string;
  linear_workspace_id: string | null;
  linear_team_id: string | null;
  linear_project_id: string | null;
  linear_state_id: string | null;
  updated_at: string;
}

interface LinearOAuthConnection {
  connected: boolean;
  expires_at: string | null;
  scope: string | null;
}

interface TeamSettingsPayload {
  team_id: string;
  role: string;
  permissions: { is_owner: boolean };
  members: TeamMember[];
  invites: TeamInvite[];
  linear: {
    settings: LinearIntegrationSettings | null;
    connection: LinearOAuthConnection;
  };
}

export interface UseTeamSettingsParams {
  open: boolean;
  teamId: string | undefined;
  teamName: string | undefined;
  isOwner: boolean;
  onTeamUpdated: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  linearOAuthNotice?: { status: 'success' | 'error'; reason?: string } | null;
  onLinearOAuthNoticeHandled?: () => void;
  resolveLinearOAuthStatus: (input: { status: 'success' | 'error'; reason?: string }) => LinearStatus;
}

export interface UseTeamSettingsReturn {
  activeTab: SettingsTab;
  setActiveTab: (tab: SettingsTab) => void;
  name: string;
  setName: (value: string) => void;
  members: TeamMember[];
  invites: TeamInvite[];
  inviteEmail: string;
  setInviteEmail: (value: string) => void;
  loading: boolean;
  inviteStatus: InviteStatus;
  linearStatus: LinearStatus;
  removingId: string | null;
  cancelingId: string | null;
  deleting: boolean;
  savingLinearSettings: boolean;
  disconnectingLinear: boolean;
  linearWorkspaceId: string;
  linearTeamId: string;
  setLinearTeamId: (value: string) => void;
  linearProjectId: string;
  setLinearProjectId: (value: string) => void;
  linearStateId: string;
  setLinearStateId: (value: string) => void;
  linearConnected: boolean;
  linearScope: string | null;
  linearExpiresAt: string | null;
  error: string | null;
  handleRename: (event: React.FormEvent) => Promise<void>;
  handleInvite: (event: React.FormEvent) => Promise<void>;
  handleRemoveMember: (userId: string) => Promise<void>;
  handleCancelInvite: (inviteId: string) => Promise<void>;
  handleConnectLinear: () => void;
  handleDisconnectLinear: () => Promise<void>;
  handleSaveLinearSettings: (event: React.FormEvent) => Promise<void>;
  handleDeleteTeam: () => Promise<void>;
}

function asInputValue(value: string | null | undefined): string {
  return value ?? '';
}

function asNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function useTeamSettings({
  open,
  teamId,
  teamName,
  isOwner,
  onTeamUpdated,
  onOpenChange,
  linearOAuthNotice = null,
  onLinearOAuthNoticeHandled,
  resolveLinearOAuthStatus,
}: UseTeamSettingsParams): UseTeamSettingsReturn {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [name, setName] = useState('');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>({ type: 'idle' });
  const [linearStatus, setLinearStatus] = useState<LinearStatus>({ type: 'idle' });
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingLinearSettings, setSavingLinearSettings] = useState(false);
  const [disconnectingLinear, setDisconnectingLinear] = useState(false);
  const [linearWorkspaceId, setLinearWorkspaceId] = useState('');
  const [linearTeamId, setLinearTeamId] = useState('');
  const [linearProjectId, setLinearProjectId] = useState('');
  const [linearStateId, setLinearStateId] = useState('');
  const [linearConnected, setLinearConnected] = useState(false);
  const [linearScope, setLinearScope] = useState<string | null>(null);
  const [linearExpiresAt, setLinearExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!teamId) return;

    try {
      setLoading(true);
      setError(null);

      const data = await fetchJson<TeamSettingsPayload>(
        `/api/teams/${teamId}/settings`,
        undefined,
        'Failed to fetch team settings',
      );

      setMembers(data.members ?? []);
      setInvites(data.invites ?? []);
      setLinearWorkspaceId(asInputValue(data.linear.settings?.linear_workspace_id));
      setLinearTeamId(asInputValue(data.linear.settings?.linear_team_id));
      setLinearProjectId(asInputValue(data.linear.settings?.linear_project_id));
      setLinearStateId(asInputValue(data.linear.settings?.linear_state_id));
      setLinearConnected(Boolean(data.linear.connection.connected));
      setLinearScope(data.linear.connection.scope ?? null);
      setLinearExpiresAt(data.linear.connection.expires_at ?? null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (open && teamId) {
      setActiveTab('general');
      setName(teamName ?? '');
      setError(null);
      setInviteStatus({ type: 'idle' });
      setLinearStatus({ type: 'idle' });
      loadData();
    }
  }, [open, teamId, teamName, loadData]);

  useEffect(() => {
    if (!open || !linearOAuthNotice) return;

    setActiveTab('integrations');
    setLinearStatus(resolveLinearOAuthStatus(linearOAuthNotice));
    onLinearOAuthNoticeHandled?.();
  }, [open, linearOAuthNotice, onLinearOAuthNoticeHandled, resolveLinearOAuthStatus]);

  async function handleRename(event: React.FormEvent) {
    event.preventDefault();
    if (!teamId || !name.trim() || name === teamName) return;

    try {
      setError(null);
      await fetchJson(
        `/api/teams/${teamId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() }),
        },
        'Failed to rename team',
      );
      await onTeamUpdated();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!teamId || !inviteEmail.trim()) return;

    setInviteStatus({ type: 'loading' });
    try {
      const data = await fetchJson<{ status: 'added' | 'invited' }>(
        `/api/teams/${teamId}/invites`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: inviteEmail.trim() }),
        },
        'Failed to invite user',
      );

      setInviteEmail('');
      await loadData();
      setInviteStatus({
        type: 'success',
        message: data.status === 'added' ? 'User added to team' : 'Invitation sent',
      });
      setTimeout(() => setInviteStatus({ type: 'idle' }), 3000);
    } catch (err) {
      setInviteStatus({ type: 'error', message: errorMessage(err) });
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!teamId) return;

    try {
      setRemovingId(userId);
      setError(null);
      await fetchJson(
        `/api/teams/${teamId}/members/${userId}`,
        {
          method: 'DELETE',
        },
        'Failed to remove member',
      );
      await loadData();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRemovingId(null);
    }
  }

  async function handleCancelInvite(inviteId: string) {
    if (!teamId) return;

    try {
      setCancelingId(inviteId);
      setError(null);
      await fetchJson(
        `/api/teams/${teamId}/invites/${inviteId}`,
        {
          method: 'DELETE',
        },
        'Failed to cancel invite',
      );
      await loadData();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCancelingId(null);
    }
  }

  function handleConnectLinear() {
    if (!teamId || typeof window === 'undefined') return;

    const returnTo = `${window.location.pathname}${window.location.search}`;
    const params = new URLSearchParams({
      team_id: teamId,
      return_to: returnTo,
    });

    window.location.assign(`/api/integrations/linear/oauth/start?${params.toString()}`);
  }

  async function handleDisconnectLinear() {
    if (!teamId) return;

    try {
      setDisconnectingLinear(true);
      setLinearStatus({ type: 'loading' });
      await fetchJson(
        `/api/integrations/linear/oauth/connection?team_id=${teamId}`,
        {
          method: 'DELETE',
        },
        'Failed to disconnect Linear',
      );
      await loadData();
      setLinearStatus({ type: 'success', message: 'Linear disconnected' });
    } catch (err) {
      setLinearStatus({ type: 'error', message: errorMessage(err) });
    } finally {
      setDisconnectingLinear(false);
    }
  }

  async function handleSaveLinearSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!teamId) return;

    try {
      setSavingLinearSettings(true);
      setLinearStatus({ type: 'loading' });
      await fetchJson(
        `/api/teams/${teamId}/integrations/linear`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            linear_team_id: asNullable(linearTeamId),
            linear_project_id: asNullable(linearProjectId),
            linear_state_id: asNullable(linearStateId),
          }),
        },
        'Failed to save Linear settings',
      );
      await loadData();
      setLinearStatus({ type: 'success', message: 'Linear settings saved' });
    } catch (err) {
      setLinearStatus({ type: 'error', message: errorMessage(err) });
    } finally {
      setSavingLinearSettings(false);
    }
  }

  async function handleDeleteTeam() {
    if (!teamId) return;

    try {
      setDeleting(true);
      setError(null);
      await fetchJson(
        `/api/teams/${teamId}`,
        {
          method: 'DELETE',
        },
        'Failed to delete team',
      );
      onOpenChange(false);
      await onTeamUpdated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return {
    activeTab,
    setActiveTab,
    name,
    setName,
    members,
    invites,
    inviteEmail,
    setInviteEmail,
    loading,
    inviteStatus,
    linearStatus,
    removingId,
    cancelingId,
    deleting,
    savingLinearSettings,
    disconnectingLinear,
    linearWorkspaceId,
    linearTeamId,
    setLinearTeamId,
    linearProjectId,
    setLinearProjectId,
    linearStateId,
    setLinearStateId,
    linearConnected,
    linearScope,
    linearExpiresAt,
    error,
    handleRename,
    handleInvite,
    handleRemoveMember,
    handleCancelInvite,
    handleConnectLinear,
    handleDisconnectLinear,
    handleSaveLinearSettings,
    handleDeleteTeam,
  };
}
