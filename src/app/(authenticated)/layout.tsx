import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { TeamProvider } from '@/lib/contexts/team-context';
import { createClient } from '@/lib/supabase/server';
import type { TeamWithRole } from '@/types';

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  // Fetch teams server-side - no client-side race conditions
  const { data: memberData } = await supabase
    .from('team_members')
    .select('role, teams(id, name, created_at, updated_at)')
    .eq('user_id', user.id)
    .order('created_at');

  type TeamRow = { id: string; name: string; created_at: string; updated_at: string };
  const teams: TeamWithRole[] = (memberData ?? [])
    .filter((m) => m.teams)
    .map((m) => {
      const t = m.teams as unknown as TeamRow;
      return { id: t.id, name: t.name, created_at: t.created_at, updated_at: t.updated_at, role: m.role };
    });

  return (
    <TeamProvider initialTeams={teams}>
      <AppShell userEmail={user.email ?? null}>{children}</AppShell>
    </TeamProvider>
  );
}
