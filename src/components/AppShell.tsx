import { Logo } from '@/components/Logo';
import { TeamControls } from '@/components/TeamControls';
import type { TeamWithRole } from '@/types';

interface AppShellProps {
  children: React.ReactNode;
  userEmail: string | null;
  teams: TeamWithRole[];
  initialCurrentTeamId: string | null;
}

export function AppShell({ children, userEmail, teams, initialCurrentTeamId }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background">
        <div className="flex h-[var(--header-height)] items-center justify-between px-4">
          <Logo />
          <TeamControls userEmail={userEmail} initialTeams={teams} initialCurrentTeamId={initialCurrentTeamId} />
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
