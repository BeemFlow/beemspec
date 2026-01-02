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
import type { TeamInvite, TeamMember, TeamWithRole } from '@/types';

type InviteStatus =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; message: string }
  | { type: 'error'; message: string };

interface TeamSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: TeamWithRole | null;
  onTeamUpdated: () => Promise<void>;
}

export function TeamSettingsDialog({ open, onOpenChange, team, onTeamUpdated }: TeamSettingsDialogProps) {
  const [name, setName] = useState('');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<InviteStatus>({ type: 'idle' });
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isOwner = team?.role === 'owner';

  const loadData = useCallback(async () => {
    if (!team) return;
    setLoading(true);

    const [membersRes, invitesRes] = await Promise.all([
      fetch(`/api/teams/${team.id}/members`),
      isOwner ? fetch(`/api/teams/${team.id}/invites`) : Promise.resolve(null),
    ]);

    if (membersRes.ok) {
      setMembers(await membersRes.json());
    }
    if (invitesRes?.ok) {
      setInvites(await invitesRes.json());
    }

    setLoading(false);
  }, [team, isOwner]);

  useEffect(() => {
    if (open && team) {
      setName(team.name);
      setInviteStatus({ type: 'idle' });
      loadData();
    }
  }, [open, team, loadData]);

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!team || !name.trim() || name === team.name) return;

    const res = await fetch(`/api/teams/${team.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });

    if (res.ok) {
      await onTeamUpdated();
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!team || !inviteEmail.trim()) return;

    setInviteStatus({ type: 'loading' });
    const res = await fetch(`/api/teams/${team.id}/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    });

    const data = await res.json();

    if (res.ok) {
      setInviteEmail('');
      await loadData();
      setInviteStatus({
        type: 'success',
        message: data.status === 'added' ? 'User added to team' : 'Invitation sent',
      });
      setTimeout(() => setInviteStatus({ type: 'idle' }), 3000);
    } else {
      setInviteStatus({ type: 'error', message: data.error || 'Failed to invite' });
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!team) return;

    setRemovingId(userId);
    const res = await fetch(`/api/teams/${team.id}/members/${userId}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      await loadData();
    }
    setRemovingId(null);
  }

  async function handleCancelInvite(inviteId: string) {
    if (!team) return;

    setCancelingId(inviteId);
    const res = await fetch(`/api/teams/${team.id}/invites/${inviteId}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      await loadData();
    }
    setCancelingId(null);
  }

  async function handleDeleteTeam() {
    if (!team) return;

    setDeleting(true);
    const res = await fetch(`/api/teams/${team.id}`, { method: 'DELETE' });

    if (res.ok) {
      onOpenChange(false);
      await onTeamUpdated();
    }
    setDeleting(false);
  }

  if (!team) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Team Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4 space-y-4">
            <form onSubmit={handleRename} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="team-name">Team name</Label>
                <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} />
              </div>
              {isOwner && (
                <Button type="submit" disabled={!name.trim() || name === team.name}>
                  Save
                </Button>
              )}
              {!isOwner && <p className="text-sm text-muted-foreground">Only team owners can rename the team.</p>}
            </form>

            {isOwner && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">Danger Zone</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Deleting this team will permanently remove all story maps, activities, tasks, and stories.
                  </p>
                  <DeleteButton
                    onDelete={handleDeleteTeam}
                    loading={deleting}
                    label="Delete team"
                    confirmTitle="Delete team"
                    confirmDescription="This action cannot be undone. All story maps and their content will be permanently deleted."
                    confirmText={team.name}
                  />
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="members" className="mt-4 space-y-4">
            {isOwner && (
              <>
                <form onSubmit={handleInvite} className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="Email address"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
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
                  {/* Pending Invites */}
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
                            onDelete={() => handleCancelInvite(invite.id)}
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

                  {/* Members */}
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
                            onDelete={() => handleRemoveMember(member.user_id)}
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
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
