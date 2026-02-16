'use client';

import { AlertTriangle, Clock, Loader2, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DeleteButton } from '@/components/ui/delete-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/errors';
import { fetchJson } from '@/lib/http';
import type { TeamInvite, TeamMember, TeamWithRole } from '@/types';

type SettingsTab = 'general' | 'integrations' | 'members' | 'danger';

type InviteStatus =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

type LinearStatus =
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

interface TeamSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: TeamWithRole | null;
  onTeamUpdated: () => Promise<void>;
  linearOAuthNotice?: { status: 'success' | 'error'; reason?: string } | null;
  onLinearOAuthNoticeHandled?: () => void;
}

interface TeamGeneralTabProps {
  isOwner: boolean;
  teamName: string;
  name: string;
  onNameChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => Promise<void>;
}

interface TeamIntegrationsTabProps {
  isOwner: boolean;
  linearConnected: boolean;
  linearScope: string | null;
  linearExpiresAt: string | null;
  linearWorkspaceId: string;
  linearTeamId: string;
  linearProjectId: string;
  linearStateId: string;
  savingLinearSettings: boolean;
  disconnectingLinear: boolean;
  linearStatus: LinearStatus;
  onConnectLinear: () => void;
  onDisconnectLinear: () => Promise<void>;
  onSaveLinearSettings: (event: React.FormEvent) => Promise<void>;
  onLinearTeamIdChange: (value: string) => void;
  onLinearProjectIdChange: (value: string) => void;
  onLinearStateIdChange: (value: string) => void;
}

interface TeamMembersTabProps {
  isOwner: boolean;
  loading: boolean;
  inviteEmail: string;
  inviteStatus: InviteStatus;
  members: TeamMember[];
  invites: TeamInvite[];
  removingId: string | null;
  cancelingId: string | null;
  onInviteEmailChange: (value: string) => void;
  onInviteSubmit: (event: React.FormEvent) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
  onCancelInvite: (inviteId: string) => Promise<void>;
}

interface TeamDangerTabProps {
  isOwner: boolean;
  teamName: string;
  deleting: boolean;
  onDeleteTeam: () => Promise<void>;
}

const LINEAR_OAUTH_REASON_TO_MESSAGE: Record<string, string> = {
  missing_state: 'Linear OAuth failed: missing state.',
  invalid_state: 'Linear OAuth failed: invalid state.',
  not_owner: 'Only team owners can connect Linear.',
  authorization_denied: 'Linear OAuth was cancelled or denied.',
  token_exchange_failed: 'Linear OAuth failed while exchanging the code.',
};

function linearOAuthNoticeToStatus(input: { status: 'success' | 'error'; reason?: string }): LinearStatus {
  if (input.status === 'success') {
    return { type: 'success', message: 'Linear OAuth connection updated.' };
  }

  const mappedReason = input.reason ? LINEAR_OAUTH_REASON_TO_MESSAGE[input.reason] : null;
  return { type: 'error', message: mappedReason ?? 'Linear OAuth failed.' };
}

function asInputValue(value: string | null | undefined): string {
  return value ?? '';
}

function asNullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function TeamGeneralTab({ isOwner, teamName, name, onNameChange, onSubmit }: TeamGeneralTabProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="team-name">Team name</Label>
        <Input id="team-name" value={name} onChange={(event) => onNameChange(event.target.value)} disabled={!isOwner} />
      </div>
      {isOwner && (
        <Button type="submit" disabled={!name.trim() || name === teamName}>
          Save
        </Button>
      )}
      {!isOwner && <p className="text-sm text-muted-foreground">Only team owners can rename the team.</p>}
    </form>
  );
}

function LinearConnectionSummary(input: { connected: boolean; scope: string | null; expiresAt: string | null }) {
  return (
    <div className="rounded-md border px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Connection</span>
        <Badge variant={input.connected ? 'default' : 'secondary'}>
          {input.connected ? 'connected' : 'not connected'}
        </Badge>
      </div>
      {input.scope && <p className="mt-2 text-xs text-muted-foreground">Scopes: {input.scope}</p>}
      {input.expiresAt && <p className="mt-1 text-xs text-muted-foreground">Expires: {input.expiresAt}</p>}
    </div>
  );
}

function LinearConnectionActions(input: {
  isOwner: boolean;
  connected: boolean;
  disconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => Promise<void>;
}) {
  if (!input.isOwner) {
    return <p className="text-sm text-muted-foreground">Only team owners can manage Linear OAuth connection.</p>;
  }

  return (
    <div className="flex items-center gap-2">
      {!input.connected ? (
        <Button type="button" variant="outline" onClick={input.onConnect}>
          Connect Linear
        </Button>
      ) : (
        <Button type="button" variant="outline" onClick={input.onDisconnect} disabled={input.disconnecting}>
          {input.disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Disconnect Linear'}
        </Button>
      )}
    </div>
  );
}

function LinearSettingsForm(input: {
  isOwner: boolean;
  workspaceId: string;
  teamId: string;
  projectId: string;
  stateId: string;
  saving: boolean;
  onSave: (event: React.FormEvent) => Promise<void>;
  onTeamIdChange: (value: string) => void;
  onProjectIdChange: (value: string) => void;
  onStateIdChange: (value: string) => void;
}) {
  return (
    <form onSubmit={input.onSave} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="linear-workspace-id">Linear workspace ID</Label>
        <Input id="linear-workspace-id" value={input.workspaceId} disabled readOnly />
      </div>
      <div className="space-y-2">
        <Label htmlFor="linear-team-id">Linear team ID</Label>
        <Input
          id="linear-team-id"
          value={input.teamId}
          onChange={(event) => input.onTeamIdChange(event.target.value)}
          disabled={!input.isOwner || input.saving}
          placeholder="e.g. 8f4e0f2b-..."
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="linear-project-id">Linear project ID (optional)</Label>
        <Input
          id="linear-project-id"
          value={input.projectId}
          onChange={(event) => input.onProjectIdChange(event.target.value)}
          disabled={!input.isOwner || input.saving}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="linear-state-id">Linear state ID (optional)</Label>
        <Input
          id="linear-state-id"
          value={input.stateId}
          onChange={(event) => input.onStateIdChange(event.target.value)}
          disabled={!input.isOwner || input.saving}
        />
      </div>
      {input.isOwner && (
        <Button type="submit" disabled={input.saving}>
          {input.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Linear settings'}
        </Button>
      )}
    </form>
  );
}

function TeamIntegrationsTab({
  isOwner,
  linearConnected,
  linearScope,
  linearExpiresAt,
  linearWorkspaceId,
  linearTeamId,
  linearProjectId,
  linearStateId,
  savingLinearSettings,
  disconnectingLinear,
  linearStatus,
  onConnectLinear,
  onDisconnectLinear,
  onSaveLinearSettings,
  onLinearTeamIdChange,
  onLinearProjectIdChange,
  onLinearStateIdChange,
}: TeamIntegrationsTabProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Linear Integration</h3>
        <p className="text-sm text-muted-foreground">
          Connect a team-scoped Linear OAuth account and configure default target IDs.
        </p>
      </div>

      <LinearConnectionSummary connected={linearConnected} scope={linearScope} expiresAt={linearExpiresAt} />

      <LinearConnectionActions
        isOwner={isOwner}
        connected={linearConnected}
        disconnecting={disconnectingLinear}
        onConnect={onConnectLinear}
        onDisconnect={onDisconnectLinear}
      />

      <LinearSettingsForm
        isOwner={isOwner}
        workspaceId={linearWorkspaceId}
        teamId={linearTeamId}
        projectId={linearProjectId}
        stateId={linearStateId}
        saving={savingLinearSettings}
        onSave={onSaveLinearSettings}
        onTeamIdChange={onLinearTeamIdChange}
        onProjectIdChange={onLinearProjectIdChange}
        onStateIdChange={onLinearStateIdChange}
      />

      {linearStatus.type === 'success' && <p className="text-sm text-green-600">{linearStatus.message}</p>}
      {linearStatus.type === 'error' && <p className="text-sm text-destructive">{linearStatus.message}</p>}
    </div>
  );
}

function TeamMembersTab({
  isOwner,
  loading,
  inviteEmail,
  inviteStatus,
  members,
  invites,
  removingId,
  cancelingId,
  onInviteEmailChange,
  onInviteSubmit,
  onRemoveMember,
  onCancelInvite,
}: TeamMembersTabProps) {
  return (
    <div className="space-y-4">
      {isOwner && (
        <>
          <form onSubmit={onInviteSubmit} className="space-y-2">
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Email address"
                value={inviteEmail}
                onChange={(event) => onInviteEmailChange(event.target.value)}
                disabled={inviteStatus.type === 'loading'}
              />
              <Button type="submit" disabled={!inviteEmail.trim() || inviteStatus.type === 'loading'}>
                {inviteStatus.type === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
              </Button>
            </div>
            {inviteStatus.type === 'success' && <p className="text-sm text-green-600">{inviteStatus.message}</p>}
            {inviteStatus.type === 'error' && <p className="text-sm text-destructive">{inviteStatus.message}</p>}
          </form>
          <Separator />
        </>
      )}

      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {isOwner && invites.length > 0 && (
              <>
                <p className="text-xs font-medium uppercase text-muted-foreground">Pending Invites</p>
                {invites.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{invite.email}</span>
                      <Badge variant="outline" className="gap-1">
                        <Clock className="h-3 w-3" />
                        pending
                      </Badge>
                    </div>
                    <DeleteButton
                      onDelete={() => onCancelInvite(invite.id)}
                      iconOnly
                      loading={cancelingId === invite.id}
                      confirmTitle="Cancel invite?"
                      confirmDescription={`The invitation to ${invite.email} will be cancelled.`}
                    />
                  </div>
                ))}
                <Separator className="my-2" />
              </>
            )}

            {members.length > 0 && <p className="text-xs font-medium uppercase text-muted-foreground">Members</p>}

            {members.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No members found</p>
            ) : (
              members.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{member.email}</span>
                    <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>{member.role}</Badge>
                  </div>
                  {isOwner && member.role !== 'owner' && (
                    <DeleteButton
                      onDelete={() => onRemoveMember(member.user_id)}
                      iconOnly
                      loading={removingId === member.user_id}
                      confirmTitle="Remove member?"
                      confirmDescription={`${member.email} will be removed from the team.`}
                    />
                  )}
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TeamDangerTab({ isOwner, teamName, deleting, onDeleteTeam }: TeamDangerTabProps) {
  if (!isOwner) {
    return <p className="text-sm text-muted-foreground">Only team owners can delete a team.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-destructive">
        <AlertTriangle className="h-4 w-4" />
        <span className="text-sm font-medium">Danger Zone</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Deleting this team will permanently remove all story maps, activities, tasks, and stories.
      </p>
      <DeleteButton
        onDelete={onDeleteTeam}
        loading={deleting}
        label="Delete team"
        confirmTitle="Delete team"
        confirmDescription="This action cannot be undone. All story maps and their content will be permanently deleted."
        confirmText={teamName}
      />
    </div>
  );
}

export function TeamSettingsDialog({
  open,
  onOpenChange,
  team,
  onTeamUpdated,
  linearOAuthNotice = null,
  onLinearOAuthNoticeHandled,
}: TeamSettingsDialogProps) {
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

  const isOwner = team?.role === 'owner';

  const loadData = useCallback(async () => {
    if (!team) return;

    try {
      setLoading(true);
      setError(null);

      const data = await fetchJson<TeamSettingsPayload>(
        `/api/teams/${team.id}/settings`,
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
  }, [team]);

  useEffect(() => {
    if (open && team) {
      setActiveTab('general');
      setName(team.name);
      setError(null);
      setInviteStatus({ type: 'idle' });
      setLinearStatus({ type: 'idle' });
      loadData();
    }
  }, [open, team, loadData]);

  useEffect(() => {
    if (!open || !linearOAuthNotice) return;

    setActiveTab('integrations');
    setLinearStatus(linearOAuthNoticeToStatus(linearOAuthNotice));
    onLinearOAuthNoticeHandled?.();
  }, [open, linearOAuthNotice, onLinearOAuthNoticeHandled]);

  async function handleRename(event: React.FormEvent) {
    event.preventDefault();
    if (!team || !name.trim() || name === team.name) return;

    try {
      setError(null);
      await fetchJson(
        `/api/teams/${team.id}`,
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
    if (!team || !inviteEmail.trim()) return;

    setInviteStatus({ type: 'loading' });
    try {
      const data = await fetchJson<{ status: 'added' | 'invited' }>(
        `/api/teams/${team.id}/invites`,
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
    if (!team) return;

    try {
      setRemovingId(userId);
      setError(null);
      await fetchJson(
        `/api/teams/${team.id}/members/${userId}`,
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
    if (!team) return;

    try {
      setCancelingId(inviteId);
      setError(null);
      await fetchJson(
        `/api/teams/${team.id}/invites/${inviteId}`,
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
    if (!team || typeof window === 'undefined') return;

    const returnTo = `${window.location.pathname}${window.location.search}`;
    const params = new URLSearchParams({
      team_id: team.id,
      return_to: returnTo,
    });

    window.location.assign(`/api/integrations/linear/oauth/start?${params.toString()}`);
  }

  async function handleDisconnectLinear() {
    if (!team) return;

    try {
      setDisconnectingLinear(true);
      setLinearStatus({ type: 'loading' });
      await fetchJson(
        `/api/integrations/linear/oauth/connection?team_id=${team.id}`,
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
    if (!team) return;

    try {
      setSavingLinearSettings(true);
      setLinearStatus({ type: 'loading' });
      await fetchJson(
        `/api/teams/${team.id}/integrations/linear`,
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
    if (!team) return;

    try {
      setDeleting(true);
      setError(null);
      await fetchJson(
        `/api/teams/${team.id}`,
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

  if (!team) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Team Settings</DialogTitle>
        </DialogHeader>

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SettingsTab)} className="mt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="danger">Danger</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <TeamGeneralTab
              isOwner={isOwner}
              teamName={team.name}
              name={name}
              onNameChange={setName}
              onSubmit={handleRename}
            />
          </TabsContent>

          <TabsContent value="integrations" className="mt-4">
            <TeamIntegrationsTab
              isOwner={isOwner}
              linearConnected={linearConnected}
              linearScope={linearScope}
              linearExpiresAt={linearExpiresAt}
              linearWorkspaceId={linearWorkspaceId}
              linearTeamId={linearTeamId}
              linearProjectId={linearProjectId}
              linearStateId={linearStateId}
              savingLinearSettings={savingLinearSettings}
              disconnectingLinear={disconnectingLinear}
              linearStatus={linearStatus}
              onConnectLinear={handleConnectLinear}
              onDisconnectLinear={handleDisconnectLinear}
              onSaveLinearSettings={handleSaveLinearSettings}
              onLinearTeamIdChange={setLinearTeamId}
              onLinearProjectIdChange={setLinearProjectId}
              onLinearStateIdChange={setLinearStateId}
            />
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <TeamMembersTab
              isOwner={isOwner}
              loading={loading}
              inviteEmail={inviteEmail}
              inviteStatus={inviteStatus}
              members={members}
              invites={invites}
              removingId={removingId}
              cancelingId={cancelingId}
              onInviteEmailChange={setInviteEmail}
              onInviteSubmit={handleInvite}
              onRemoveMember={handleRemoveMember}
              onCancelInvite={handleCancelInvite}
            />
          </TabsContent>

          <TabsContent value="danger" className="mt-4">
            <TeamDangerTab isOwner={isOwner} teamName={team.name} deleting={deleting} onDeleteTeam={handleDeleteTeam} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
