import { createClient } from '@/lib/supabase/server';

/**
 * Return the role a user holds on a team, or null if they are not a member.
 */
export async function getTeamRoleForUser(userId: string, teamId: string): Promise<string | null> {
  const supabase = await createClient();
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
export async function isTeamOwnerForRequest(userId: string, teamId: string): Promise<boolean> {
  return (await getTeamRoleForUser(userId, teamId)) === 'owner';
}
