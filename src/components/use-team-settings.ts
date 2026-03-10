import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '@/lib/errors';
import { fetchJson } from '@/lib/http';
import type { TeamInvite, TeamMember } from '@/types';

type StoryStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';
const STORY_STATUSES: StoryStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];

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
  linear_status_mapping?: Partial<Record<StoryStatus, string>>;
  updated_at: string;
}

interface LinearOAuthConnection {
  connected: boolean;
  expires_at: string | null;
  scope: string | null;
}

interface LinearTeamOption {
  id: string;
  name: string;
  key: string | null;
}

interface LinearProjectOption {
  id: string;
  name: string;
  teamId: string;
}

interface LinearStateOption {
  id: string;
  name: string;
  type: string | null;
  teamId: string;
}

interface LinearOptionsPayload {
  connected: boolean;
  settings: LinearIntegrationSettings | null;
  options: {
    workspace_id: string | null;
    teams: LinearTeamOption[];
    projects: LinearProjectOption[];
    states: LinearStateOption[];
  };
  applied_defaults: boolean;
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
  linearStatusMapping: Partial<Record<StoryStatus, string>>;
  setLinearStatusMappingValue: (status: StoryStatus, value: string) => void;
  linearConnected: boolean;
  linearScope: string | null;
  linearExpiresAt: string | null;
  linearOptionsLoading: boolean;
  linearTeamOptions: LinearTeamOption[];
  linearStateOptions: LinearStateOption[];
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

function normalizeStatusMapping(
  value: Partial<Record<StoryStatus, string>> | null | undefined,
): Partial<Record<StoryStatus, string>> {
  const normalized: Partial<Record<StoryStatus, string>> = {};
  for (const status of STORY_STATUSES) {
    const item = asNullable(value?.[status] ?? '');
    if (item) normalized[status] = item;
  }
  return normalized;
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
  const [linearTeamId, setLinearTeamIdState] = useState('');
  const [linearStatusMapping, setLinearStatusMapping] = useState<Partial<Record<StoryStatus, string>>>({});
  const [linearConnected, setLinearConnected] = useState(false);
  const [linearScope, setLinearScope] = useState<string | null>(null);
  const [linearExpiresAt, setLinearExpiresAt] = useState<string | null>(null);
  const [linearOptionsLoading, setLinearOptionsLoading] = useState(false);
  const [linearTeamOptions, setLinearTeamOptions] = useState<LinearTeamOption[]>([]);
  const [linearStateOptions, setLinearStateOptions] = useState<LinearStateOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadLinearOptions = useCallback(async (inputTeamId: string) => {
    setLinearOptionsLoading(true);
    try {
      const data = await fetchJson<LinearOptionsPayload>(
        `/api/teams/${inputTeamId}/integrations/linear/options`,
        undefined,
        'Failed to fetch Linear options',
      );

      setLinearWorkspaceId(asInputValue(data.settings?.linear_workspace_id ?? data.options.workspace_id));
      setLinearTeamIdState(asInputValue(data.settings?.linear_team_id));
      setLinearStatusMapping(normalizeStatusMapping(data.settings?.linear_status_mapping));

      setLinearTeamOptions(data.options.teams ?? []);
      setLinearStateOptions(data.options.states ?? []);

      if (data.applied_defaults) {
        setLinearStatus({ type: 'success', message: 'Linear defaults configured automatically' });
      }
    } catch (err) {
      setLinearStatus({ type: 'error', message: errorMessage(err) });
    } finally {
      setLinearOptionsLoading(false);
    }
  }, []);

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
      setLinearTeamIdState(asInputValue(data.linear.settings?.linear_team_id));
      setLinearStatusMapping(normalizeStatusMapping(data.linear.settings?.linear_status_mapping));
      setLinearConnected(Boolean(data.linear.connection.connected));
      setLinearScope(data.linear.connection.scope ?? null);
      setLinearExpiresAt(data.linear.connection.expires_at ?? null);
      if (!data.linear.connection.connected) {
        setLinearTeamOptions([]);
        setLinearStateOptions([]);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (!open || activeTab !== 'integrations' || !teamId || !isOwner || !linearConnected) return;
    loadLinearOptions(teamId);
  }, [activeTab, isOwner, linearConnected, loadLinearOptions, open, teamId]);

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

    if (linearOAuthNotice.status === 'success' && teamId && isOwner) {
      void (async () => {
        await loadData();
        await loadLinearOptions(teamId);
      })();
    }

    onLinearOAuthNoticeHandled?.();
  }, [
    open,
    linearOAuthNotice,
    teamId,
    isOwner,
    loadData,
    loadLinearOptions,
    onLinearOAuthNoticeHandled,
    resolveLinearOAuthStatus,
  ]);

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
            linear_status_mapping: normalizeStatusMapping(linearStatusMapping),
          }),
        },
        'Failed to save Linear settings',
      );
      await loadData();
      await loadLinearOptions(teamId);
      setLinearStatus({ type: 'success', message: 'Linear settings saved' });
    } catch (err) {
      setLinearStatus({ type: 'error', message: errorMessage(err) });
    } finally {
      setSavingLinearSettings(false);
    }
  }

  function setLinearTeamId(value: string) {
    setLinearTeamIdState(value);

    setLinearStatusMapping((current) => {
      if (!value) return current;
      const allowedStateIds = new Set(
        linearStateOptions.filter((state) => state.teamId === value).map((state) => state.id),
      );
      const next: Partial<Record<StoryStatus, string>> = {};
      for (const status of STORY_STATUSES) {
        const mapped = current[status];
        if (mapped && allowedStateIds.has(mapped)) next[status] = mapped;
      }
      return next;
    });
  }

  function setLinearStatusMappingValue(status: StoryStatus, value: string) {
    setLinearStatusMapping((current) => {
      const next = { ...current };
      const normalized = asNullable(value);
      if (normalized) next[status] = normalized;
      else delete next[status];
      return next;
    });
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
    linearStatusMapping,
    setLinearStatusMappingValue,
    linearConnected,
    linearScope,
    linearExpiresAt,
    linearOptionsLoading,
    linearTeamOptions,
    linearStateOptions,
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
