'use client';

import { Check, ChevronDown, LogOut, Plus, Settings, User } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { TeamSettingsDialog } from '@/components/team-settings-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PromptDialog } from '@/components/ui/prompt-dialog';
import { useTeam } from '@/lib/contexts/team-context';

interface AppShellProps {
  children: React.ReactNode;
  userEmail: string | null;
}

type TeamDialog = { type: 'closed' } | { type: 'create' } | { type: 'settings' };

export function AppShell({ children, userEmail }: AppShellProps) {
  const { teams, currentTeam, setCurrentTeam, reloadTeams } = useTeam();
  const [dialog, setDialog] = useState<TeamDialog>({ type: 'closed' });

  async function handleCreateTeam(name: string) {
    const res = await fetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const team = await res.json();
      await reloadTeams();
      // Auto-select the newly created team
      setCurrentTeam({ ...team, role: 'owner' as const });
    }
  }

  const isOwner = currentTeam?.role === 'owner';

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background">
        <div className="flex h-[var(--header-height)] items-center justify-between px-4">
          {/* Left: Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg font-semibold">BeemSpec</span>
          </Link>

          {/* Right: Team Selector + User Menu */}
          <div className="flex items-center gap-3">
            {/* Team Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-[180px] justify-between">
                  <span className="truncate">{currentTeam?.name ?? 'Select team'}</span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px]">
                {teams.map((team) => (
                  <DropdownMenuItem key={team.id} onClick={() => setCurrentTeam(team)} className="justify-between">
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

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
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
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* Team Dialogs */}
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
      />
    </div>
  );
}
