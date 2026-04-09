import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getAppContext } from '@/lib/app-context';

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, teams, currentTeamId } = await getAppContext();

  if (!user) {
    redirect('/auth/login');
  }

  return (
    <AppShell userEmail={user.email ?? null} teams={teams} initialCurrentTeamId={currentTeamId}>
      {children}
    </AppShell>
  );
}
