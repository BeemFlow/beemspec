import type { Supabase } from '@/lib/supabase/types';

export interface TeamMembershipSummary {
  team_id: string;
  role: string;
  name: string | null;
}

export async function listTeamsForUser(supabase: Supabase, userId: string) {
  const membershipsResult = await supabase.from('team_members').select('team_id, role').eq('user_id', userId);
  if (membershipsResult.error) return { data: null, error: membershipsResult.error };

  const memberships = (membershipsResult.data ?? []) as Array<{ team_id: string; role: string }>;
  if (memberships.length === 0) return { data: [] as TeamMembershipSummary[], error: null };

  const teamIds = memberships.map((row) => row.team_id);
  const teamsResult = await supabase.from('teams').select('id, name').in('id', teamIds);
  if (teamsResult.error) return { data: null, error: teamsResult.error };

  const teams = (teamsResult.data ?? []) as Array<{ id: string; name: string }>;
  const byId = new Map(teams.map((team) => [team.id, team.name]));

  return {
    data: memberships.map((membership) => ({
      team_id: membership.team_id,
      role: membership.role,
      name: byId.get(membership.team_id) ?? null,
    })),
    error: null,
  };
}

/**
 * Return the role a user holds on a team, or null if they are not a member.
 */
export async function getTeamRoleForUser(supabase: Supabase, userId: string, teamId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle<{ role: string }>();

  if (error || !data) return null;
  return data.role;
}

/**
 * Check whether a user has the 'owner' role on a team.
 * Used by route handlers that require owner-level access.
 */
export async function isTeamOwnerForRequest(supabase: Supabase, userId: string, teamId: string): Promise<boolean> {
  return (await getTeamRoleForUser(supabase, userId, teamId)) === 'owner';
}
