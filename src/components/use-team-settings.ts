import { useCallback, useEffect, useState } from 'react';
import {
  type LinearStatus,
  type LinearTeamSummary,
  type UseTeamLinearSettingsReturn,
  useTeamLinearSettings,
} from '@/components/integrations/linear/use-team-linear-settings';
import { errorMessage } from '@/lib/errors';
import { fetchJson } from '@/lib/http';
import type { TeamInvite, TeamMember, TeamRole } from '@/types';

export type SettingsTab = 'general' | 'integrations' | 'members' | 'danger';

export type InviteStatus =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

interface TeamSettingsPayload {
  members: TeamMember[];
  invites: TeamInvite[];
  linear: LinearTeamSummary;
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

interface TeamSettingsState {
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
  removingId: string | null;
  updatingRoleId: string | null;
  cancelingId: string | null;
  deleting: boolean;
  error: string | null;
  handleRename: (event: React.FormEvent) => Promise<void>;
  handleInvite: (event: React.FormEvent) => Promise<void>;
  handleRemoveMember: (userId: string) => Promise<void>;
  handleChangeMemberRole: (userId: string, role: TeamRole) => Promise<void>;
  handleCancelInvite: (inviteId: string) => Promise<void>;
  handleDeleteTeam: () => Promise<void>;
}

export type UseTeamSettingsReturn = TeamSettingsState & UseTeamLinearSettingsReturn;

type MemberMutation = { type: 'remove' | 'role'; userId: string };

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
  const [memberMutation, setMemberMutation] = useState<MemberMutation | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [linearSummary, setLinearSummary] = useState<LinearTeamSummary | null>(null);
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
      setLinearSummary(data.linear);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  const activateIntegrations = useCallback(() => setActiveTab('integrations'), []);
  const linear = useTeamLinearSettings({
    open,
    integrationsActive: activeTab === 'integrations',
    teamId,
    isOwner,
    summary: linearSummary,
    oauthNotice: linearOAuthNotice,
    onOAuthNoticeHandled: onLinearOAuthNoticeHandled,
    onOAuthNoticeReceived: activateIntegrations,
    resolveOAuthStatus: resolveLinearOAuthStatus,
    refreshTeamSettings: loadData,
  });

  useEffect(() => {
    if (!open || !teamId) return;
    setActiveTab('general');
    setName(teamName ?? '');
    setError(null);
    setInviteStatus({ type: 'idle' });
    void loadData();
  }, [loadData, open, teamId, teamName]);

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
    } catch (renameError) {
      setError(errorMessage(renameError));
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
    } catch (inviteError) {
      setInviteStatus({ type: 'error', message: errorMessage(inviteError) });
    }
  }

  async function mutateMember(
    userId: string,
    mutation: Omit<MemberMutation, 'userId'>,
    init: RequestInit,
    fallback: string,
  ) {
    if (!teamId || !isOwner) return;
    try {
      setMemberMutation({ ...mutation, userId });
      setError(null);
      await fetchJson(`/api/teams/${teamId}/members/${userId}`, init, fallback);
      await loadData();
      await onTeamUpdated();
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setMemberMutation(null);
    }
  }

  async function handleRemoveMember(userId: string) {
    await mutateMember(userId, { type: 'remove' }, { method: 'DELETE' }, 'Failed to remove member');
  }

  async function handleChangeMemberRole(userId: string, role: TeamRole) {
    await mutateMember(
      userId,
      { type: 'role' },
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      },
      'Failed to update member role',
    );
  }

  async function handleCancelInvite(inviteId: string) {
    if (!teamId) return;
    try {
      setCancelingId(inviteId);
      setError(null);
      await fetchJson(`/api/teams/${teamId}/invites/${inviteId}`, { method: 'DELETE' }, 'Failed to cancel invite');
      await loadData();
    } catch (cancelError) {
      setError(errorMessage(cancelError));
    } finally {
      setCancelingId(null);
    }
  }

  async function handleDeleteTeam() {
    if (!teamId) return;
    try {
      setDeleting(true);
      setError(null);
      await fetchJson(`/api/teams/${teamId}`, { method: 'DELETE' }, 'Failed to delete team');
      onOpenChange(false);
      await onTeamUpdated();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
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
    removingId: memberMutation?.type === 'remove' ? memberMutation.userId : null,
    updatingRoleId: memberMutation?.type === 'role' ? memberMutation.userId : null,
    cancelingId,
    deleting,
    error,
    handleRename,
    handleInvite,
    handleRemoveMember,
    handleChangeMemberRole,
    handleCancelInvite,
    handleDeleteTeam,
    ...linear,
  };
}
