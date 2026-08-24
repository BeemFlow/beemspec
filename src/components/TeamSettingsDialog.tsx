'use client';

import { Clock, Loader2, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DangerZone } from '@/components/ui/danger-zone';
import { DeleteButton } from '@/components/ui/delete-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { nonCredentialFieldProps, nonCredentialFormProps } from '@/components/ui/non-credential-fields';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { SettingsDialog } from '@/components/ui/settings-dialog';
import { type InviteStatus, type SettingsTab, useTeamSettings } from '@/components/use-team-settings';
import type { TeamInvite, TeamMember, TeamRole, TeamWithRole } from '@/types';

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

import { linearOAuthNoticeToStatus, TeamLinearSettings } from '@/components/integrations/linear/TeamLinearSettings';

interface TeamMembersTabProps {
  isOwner: boolean;
  loading: boolean;
  inviteEmail: string;
  inviteStatus: InviteStatus;
  members: TeamMember[];
  invites: TeamInvite[];
  removingId: string | null;
  updatingRoleId: string | null;
  cancelingId: string | null;
  onInviteEmailChange: (value: string) => void;
  onInviteSubmit: (event: React.FormEvent) => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
  onChangeMemberRole: (userId: string, role: TeamRole) => Promise<void>;
  onCancelInvite: (inviteId: string) => Promise<void>;
}

interface TeamDangerTabProps {
  isOwner: boolean;
  teamName: string;
  deleting: boolean;
  onDeleteTeam: () => Promise<void>;
}

function TeamGeneralTab({ isOwner, teamName, name, onNameChange, onSubmit }: TeamGeneralTabProps) {
  return (
    <form {...nonCredentialFormProps} onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="team-name">Team name</Label>
        <Input
          id="team-name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          disabled={!isOwner}
          {...nonCredentialFieldProps}
        />
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

function TeamMembersTab({
  isOwner,
  loading,
  inviteEmail,
  inviteStatus,
  members,
  invites,
  removingId,
  updatingRoleId,
  cancelingId,
  onInviteEmailChange,
  onInviteSubmit,
  onRemoveMember,
  onChangeMemberRole,
  onCancelInvite,
}: TeamMembersTabProps) {
  const ownerCount = members.filter((member) => member.role === 'owner').length;

  return (
    <div className="space-y-4">
      {isOwner && (
        <>
          <form {...nonCredentialFormProps} onSubmit={onInviteSubmit} className="space-y-2">
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Email address"
                value={inviteEmail}
                onChange={(event) => onInviteEmailChange(event.target.value)}
                disabled={inviteStatus.type === 'loading'}
                {...nonCredentialFieldProps}
              />
              <Button type="submit" disabled={!inviteEmail.trim() || inviteStatus.type === 'loading'}>
                {inviteStatus.type === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
              </Button>
            </div>
            {inviteStatus.type === 'success' && <p className="text-sm text-success">{inviteStatus.message}</p>}
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
              members.map((member) => {
                const isOnlyOwner = member.role === 'owner' && ownerCount === 1;
                const isMutating = removingId === member.user_id || updatingRoleId === member.user_id;

                return (
                  <div key={member.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <span className="min-w-0 truncate text-sm">{member.email}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      {isOwner ? (
                        <Select
                          value={member.role}
                          onValueChange={(role) => onChangeMemberRole(member.user_id, role as TeamRole)}
                          disabled={isMutating}
                        >
                          <SelectTrigger size="sm" className="w-[110px]" aria-label={`Role for ${member.email}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member" disabled={isOnlyOwner}>
                              Member
                            </SelectItem>
                            <SelectItem value="owner">Owner</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>{member.role}</Badge>
                      )}
                      {isOwner && (
                        <DeleteButton
                          onDelete={() => onRemoveMember(member.user_id)}
                          iconOnly
                          loading={removingId === member.user_id}
                          disabled={isOnlyOwner || isMutating}
                          label={`Remove ${member.email}`}
                          confirmTitle="Remove member?"
                          confirmDescription={`${member.email} will be removed from the team.`}
                        />
                      )}
                    </div>
                  </div>
                );
              })
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
    updatingRoleId,
    cancelingId,
    deleting,
    savingLinearSettings,
    disconnectingLinear,
    linearWorkspaceId,
    linearWorkspaceName,
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
    handleChangeMemberRole,
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
    resolveLinearOAuthStatus: linearOAuthNoticeToStatus,
  });

  if (!team) return null;

  const tabs = [
    {
      value: 'general',
      label: 'General',
      content: (
        <TeamGeneralTab
          isOwner={isOwner}
          teamName={team.name}
          name={name}
          onNameChange={setName}
          onSubmit={handleRename}
        />
      ),
    },
    {
      value: 'integrations',
      label: 'Integrations',
      content: (
        <TeamLinearSettings
          isOwner={isOwner}
          linearConnected={linearConnected}
          linearScope={linearScope}
          linearExpiresAt={linearExpiresAt}
          linearWorkspaceId={linearWorkspaceId}
          linearWorkspaceName={linearWorkspaceName}
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
          onLinearTeamChange={setLinearTeamId}
          onLinearStatusMappingChange={setLinearStatusMappingValue}
        />
      ),
    },
    {
      value: 'members',
      label: 'Members',
      content: (
        <TeamMembersTab
          isOwner={isOwner}
          loading={loading}
          inviteEmail={inviteEmail}
          inviteStatus={inviteStatus}
          members={members}
          invites={invites}
          removingId={removingId}
          updatingRoleId={updatingRoleId}
          cancelingId={cancelingId}
          onInviteEmailChange={setInviteEmail}
          onInviteSubmit={handleInvite}
          onRemoveMember={handleRemoveMember}
          onChangeMemberRole={handleChangeMemberRole}
          onCancelInvite={handleCancelInvite}
        />
      ),
    },
    {
      value: 'danger',
      label: 'Danger',
      content: (
        <TeamDangerTab isOwner={isOwner} teamName={team.name} deleting={deleting} onDeleteTeam={handleDeleteTeam} />
      ),
    },
  ];

  return (
    <SettingsDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Team Settings"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(value) => setActiveTab(value as SettingsTab)}
      error={error}
    />
  );
}
