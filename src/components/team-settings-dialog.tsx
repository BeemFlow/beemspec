'use client';

import { Clock, Loader2, UserPlus } from 'lucide-react';
import { useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DangerZone } from '@/components/ui/danger-zone';
import { DeleteButton } from '@/components/ui/delete-button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  type InviteStatus,
  type LinearStatus,
  type SettingsTab,
  useTeamSettings,
} from '@/components/use-team-settings';
import type { TeamInvite, TeamMember, TeamWithRole } from '@/types';

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
  linearOptionsLoading: boolean;
  linearTeamOptions: Array<{ id: string; name: string; key: string | null }>;
  linearStateOptions: Array<{ id: string; name: string; type: string | null; teamId: string }>;
  linearStatusMapping: Partial<Record<'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done', string>>;
  savingLinearSettings: boolean;
  disconnectingLinear: boolean;
  linearStatus: LinearStatus;
  onConnectLinear: () => void;
  onDisconnectLinear: () => Promise<void>;
  onSaveLinearSettings: (event: React.FormEvent) => Promise<void>;
  onLinearTeamIdChange: (value: string) => void;
  onLinearStatusMappingChange: (
    status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done',
    value: string,
  ) => void;
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
  optionsLoading: boolean;
  teamOptions: Array<{ id: string; name: string; key: string | null }>;
  stateOptions: Array<{ id: string; name: string; type: string | null; teamId: string }>;
  statusMapping: Partial<Record<'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done', string>>;
  saving: boolean;
  onSave: (event: React.FormEvent) => Promise<void>;
  onTeamIdChange: (value: string) => void;
  onStatusMappingChange: (status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done', value: string) => void;
}) {
  const NO_SELECTION = '__none__';
  const filteredStateOptions = input.stateOptions.filter((state) =>
    input.teamId ? state.teamId === input.teamId : true,
  );
  const statusRows: Array<{ key: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done'; label: string }> = [
    { key: 'backlog', label: 'Backlog' },
    { key: 'todo', label: 'Todo' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'in_review', label: 'In Review' },
    { key: 'done', label: 'Done' },
  ];

  return (
    <form onSubmit={input.onSave} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="linear-workspace-id">Linear workspace ID</Label>
        <Input id="linear-workspace-id" value={input.workspaceId} disabled readOnly />
      </div>
      <div className="space-y-2">
        <Label>Linear team</Label>
        {input.teamOptions.length > 0 ? (
          <Select
            value={input.teamId || NO_SELECTION}
            onValueChange={(value) => input.onTeamIdChange(value === NO_SELECTION ? '' : value)}
            disabled={!input.isOwner || input.saving || input.optionsLoading}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a Linear team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SELECTION}>No team selected</SelectItem>
              {input.teamOptions.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                  {team.key ? ` (${team.key})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id="linear-team-id"
            value={input.teamId}
            onChange={(event) => input.onTeamIdChange(event.target.value)}
            disabled={!input.isOwner || input.saving}
            placeholder="Paste a Linear team ID"
          />
        )}
      </div>
      <div className="space-y-2">
        <Label>Status mapping</Label>
        <div className="space-y-2 rounded-md border bg-muted/20 p-3">
          {statusRows.map((row) => (
            <div key={row.key} className="grid grid-cols-[120px_1fr] items-center gap-2">
              <span className="text-xs text-muted-foreground">{row.label}</span>
              <Select
                value={input.statusMapping[row.key] ?? NO_SELECTION}
                onValueChange={(value) => input.onStatusMappingChange(row.key, value === NO_SELECTION ? '' : value)}
                disabled={!input.isOwner || input.saving || input.optionsLoading || !input.teamId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={`Map ${row.label}`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SELECTION}>Unmapped</SelectItem>
                  {filteredStateOptions.map((state) => (
                    <SelectItem key={state.id} value={state.id}>
                      {state.name}
                      {state.type ? ` (${state.type})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>
      {input.isOwner && (
        <Button type="submit" disabled={input.saving || !input.teamId.trim()}>
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
  linearOptionsLoading,
  linearTeamOptions,
  linearStateOptions,
  linearStatusMapping,
  savingLinearSettings,
  disconnectingLinear,
  linearStatus,
  onConnectLinear,
  onDisconnectLinear,
  onSaveLinearSettings,
  onLinearTeamIdChange,
  onLinearStatusMappingChange,
}: TeamIntegrationsTabProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Linear Integration</h3>
        <p className="text-sm text-muted-foreground">
          Connect a team-scoped Linear OAuth account and choose default targets.
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
        optionsLoading={linearOptionsLoading}
        teamOptions={linearTeamOptions}
        stateOptions={linearStateOptions}
        statusMapping={linearStatusMapping}
        saving={savingLinearSettings}
        onSave={onSaveLinearSettings}
        onTeamIdChange={onLinearTeamIdChange}
        onStatusMappingChange={onLinearStatusMappingChange}
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
    <DangerZone description="Deleting this team will permanently remove all story maps, activities, tasks, and stories.">
      <DeleteButton
        onDelete={onDeleteTeam}
        loading={deleting}
        label="Delete team"
        confirmTitle="Delete team"
        confirmDescription="This action cannot be undone. All story maps and their content will be permanently deleted."
        confirmText={teamName}
      />
    </DangerZone>
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
  const isOwner = team?.role === 'owner';

  const resolveLinearOAuthStatus = useCallback(linearOAuthNoticeToStatus, []);

  const {
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
  } = useTeamSettings({
    open,
    teamId: team?.id,
    teamName: team?.name,
    isOwner,
    onTeamUpdated,
    onOpenChange,
    linearOAuthNotice,
    onLinearOAuthNoticeHandled,
    resolveLinearOAuthStatus,
  });

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
              linearOptionsLoading={linearOptionsLoading}
              linearTeamOptions={linearTeamOptions}
              linearStateOptions={linearStateOptions}
              linearStatusMapping={linearStatusMapping}
              savingLinearSettings={savingLinearSettings}
              disconnectingLinear={disconnectingLinear}
              linearStatus={linearStatus}
              onConnectLinear={handleConnectLinear}
              onDisconnectLinear={handleDisconnectLinear}
              onSaveLinearSettings={handleSaveLinearSettings}
              onLinearTeamIdChange={setLinearTeamId}
              onLinearStatusMappingChange={setLinearStatusMappingValue}
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
