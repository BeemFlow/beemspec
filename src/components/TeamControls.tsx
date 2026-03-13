'use client';

import { Check, ChevronDown, LogOut, Plus, Settings, User } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TeamSettingsDialog } from '@/components/TeamSettingsDialog';
import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { PromptDialog } from '@/components/ui/PromptDialog';
import type { TeamWithRole } from '@/types';

type TeamDialog = { type: 'closed' } | { type: 'create' } | { type: 'settings' };
type LinearOAuthNotice = { status: 'success' | 'error'; reason?: string } | null;

const TEAM_COOKIE_KEY = 'beemspec_current_team_id';

function parseLinearOAuthNotice(status: string | null, reason: string | null): LinearOAuthNotice {
  if (status !== 'success' && status !== 'error') return null;
  return { status, reason: reason ?? undefined };
}

function getTeamByIdOrFirst(teams: TeamWithRole[], teamId: string | null): TeamWithRole | null {
  if (!teamId) return teams[0] ?? null;
  return teams.find((team) => team.id === teamId) ?? teams[0] ?? null;
}

function writeCurrentTeamCookie(teamId: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: broad Cookie Store API support is not reliable enough for this app shell preference
  document.cookie = `${TEAM_COOKIE_KEY}=${encodeURIComponent(teamId)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function TeamControls({
  userEmail,
  initialTeams,
  initialCurrentTeamId,
}: {
  userEmail: string | null;
  initialTeams: TeamWithRole[];
  initialCurrentTeamId: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [teams, setTeams] = useState(initialTeams);
  const [currentTeam, setCurrentTeamState] = useState<TeamWithRole | null>(() =>
    getTeamByIdOrFirst(initialTeams, initialCurrentTeamId),
  );
  const [dialog, setDialog] = useState<TeamDialog>({ type: 'closed' });
  const [linearOAuthNotice, setLinearOAuthNotice] = useState<LinearOAuthNotice>(null);

  useEffect(() => {
    setTeams(initialTeams);
    setCurrentTeamState(getTeamByIdOrFirst(initialTeams, initialCurrentTeamId));
  }, [initialTeams, initialCurrentTeamId]);

  useEffect(() => {
    const searchParamString = searchParams.toString();
    const linearOauth = searchParams.get('linear_oauth');
    const reason = searchParams.get('reason');
    const notice = parseLinearOAuthNotice(linearOauth, reason);
    if (!notice) return;

    setLinearOAuthNotice(notice);
    setDialog({ type: 'settings' });

    const next = new URLSearchParams(searchParamString);
    next.delete('linear_oauth');
    next.delete('reason');
    const nextUrl = next.toString().length > 0 ? `${pathname}?${next.toString()}` : pathname;
    window.history.replaceState({}, '', nextUrl);
  }, [pathname, searchParams]);

  function setCurrentTeam(team: TeamWithRole) {
    setCurrentTeamState(team);
    writeCurrentTeamCookie(team.id);
  }

  async function reloadTeams() {
    const res = await fetch('/api/teams');
    if (!res.ok) return;

    const list: TeamWithRole[] = await res.json();
    setTeams(list);
    setCurrentTeamState((current) => getTeamByIdOrFirst(list, current?.id ?? initialCurrentTeamId));
  }

  async function handleCreateTeam(name: string) {
    const res = await fetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;

    const team = await res.json();
    await reloadTeams();
    setCurrentTeam({ ...team, role: 'owner' as const });
    router.refresh();
  }

  function handleSelectTeam(team: TeamWithRole) {
    setCurrentTeam(team);
    router.refresh();
  }

  const isOwner = currentTeam?.role === 'owner';

  return (
    <>
      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-[180px] justify-between">
              <span className="truncate">{currentTeam?.name ?? 'Select team'}</span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[180px]">
            {teams.map((team) => (
              <DropdownMenuItem key={team.id} onClick={() => handleSelectTeam(team)} className="justify-between">
                <span className="truncate">{team.name}</span>
                {team.id === currentTeam?.id && <Check className="h-4 w-4 shrink-0" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setDialog({ type: 'create' })}>
              <Plus className="mr-2 h-4 w-4" />
              Create new team
            </DropdownMenuItem>
            {isOwner && (
              <DropdownMenuItem onClick={() => setDialog({ type: 'settings' })}>
                <Settings className="mr-2 h-4 w-4" />
                Team settings
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <User className="h-5 w-5" />
              <span className="sr-only">User menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {userEmail && (
              <>
                <div className="px-2 py-1.5 text-sm text-muted-foreground">{userEmail}</div>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild>
              <a href="/auth/logout" className="flex cursor-pointer items-center">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <PromptDialog
        open={dialog.type === 'create'}
        onOpenChange={(open) => !open && setDialog({ type: 'closed' })}
        title="Create Team"
        placeholder="Team name"
        onSubmit={handleCreateTeam}
      />
      <TeamSettingsDialog
        open={dialog.type === 'settings'}
        onOpenChange={(open) => !open && setDialog({ type: 'closed' })}
        team={currentTeam}
        onTeamUpdated={reloadTeams}
        linearOAuthNotice={linearOAuthNotice}
        onLinearOAuthNoticeHandled={() => setLinearOAuthNotice(null)}
      />
    </>
  );
}
