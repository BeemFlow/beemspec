import 'server-only';

import { cookies } from 'next/headers';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { TeamWithRole } from '@/types';

const TEAM_COOKIE_KEY = 'beemspec_current_team_id';

type TeamRow = { id: string; name: string; created_at: string; updated_at: string };

function resolveCurrentTeamId(teams: TeamWithRole[], cookieTeamId: string | null): string | null {
  if (cookieTeamId && teams.some((team) => team.id === cookieTeamId)) return cookieTeamId;
  return teams[0]?.id ?? null;
}

export const getAppContext = cache(async () => {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      user: null,
      teams: [] as TeamWithRole[],
      currentTeamId: null as string | null,
    };
  }

  const { data: memberData } = await supabase
    .from('team_members')
    .select('role, teams(id, name, created_at, updated_at)')
    .eq('user_id', user.id)
    .order('created_at');

  const teams: TeamWithRole[] = (memberData ?? [])
    .filter((membership) => membership.teams)
    .map((membership) => {
      const team = membership.teams as unknown as TeamRow;
      return {
        id: team.id,
        name: team.name,
        created_at: team.created_at,
        updated_at: team.updated_at,
        role: membership.role,
      };
    });

  const currentTeamId = resolveCurrentTeamId(teams, cookieStore.get(TEAM_COOKIE_KEY)?.value ?? null);

  return {
    supabase,
    user,
    teams,
    currentTeamId,
  };
});
