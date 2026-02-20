import { NextResponse } from 'next/server';
import { getLinearOAuthConnectionStatusForTeam } from '@/integrations/linear/connections';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getTeamRoleForUser } from '@/lib/teams';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id: teamId } = await params;
  if (!isValidUuid(teamId)) return invalidIdResponse();

  const role = await getTeamRoleForUser(auth.user.id, teamId);

  if (!role) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  const supabase = await createClient();

  const isOwner = role === 'owner';

  const membersPromise = supabase.rpc('get_team_members', { p_team_id: teamId });
  const integrationPromise = supabase
    .from('integration_settings')
    .select('team_id, linear_workspace_id, linear_team_id, linear_project_id, linear_state_id, updated_at')
    .eq('team_id', teamId)
    .maybeSingle();

  const invitesPromise = isOwner
    ? supabase
        .from('team_invites')
        .select('*')
        .eq('team_id', teamId)
        .is('accepted_at', null)
        .order('created_at', { ascending: false })
    : Promise.resolve({ data: [], error: null });

  const connectionPromise = isOwner
    ? getLinearOAuthConnectionStatusForTeam(createAdminClient(), teamId)
    : Promise.resolve(null);

  let membersResult: Awaited<typeof membersPromise>;
  let integrationResult: Awaited<typeof integrationPromise>;
  let invitesResult: Awaited<typeof invitesPromise>;
  let connection: Awaited<typeof connectionPromise>;

  try {
    [membersResult, integrationResult, invitesResult, connection] = await Promise.all([
      membersPromise,
      integrationPromise,
      invitesPromise,
      connectionPromise,
    ]);
  } catch (error) {
    return serverErrorResponse('Failed to load team settings', error);
  }

  if (membersResult.error) {
    return serverErrorResponse('Failed to load team members', membersResult.error);
  }

  if (integrationResult.error) {
    return serverErrorResponse('Failed to load integration settings', integrationResult.error);
  }

  if (invitesResult.error) {
    return serverErrorResponse('Failed to load invites', invitesResult.error);
  }

  return NextResponse.json({
    team_id: teamId,
    role,
    permissions: { is_owner: isOwner },
    members: membersResult.data ?? [],
    invites: invitesResult.data ?? [],
    linear: {
      settings: integrationResult.data ?? null,
      connection: {
        connected: Boolean(connection),
        expires_at: connection?.expiresAt ?? null,
        scope: connection?.scope ?? null,
      },
    },
  });
}
