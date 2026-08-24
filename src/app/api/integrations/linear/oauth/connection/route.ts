import { NextResponse } from 'next/server';
import { getLinearOAuthConnectionStatusForTeam } from '@/integrations/linear/connections';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTeamOwnerForRequest } from '@/lib/teams';
import { isValidUuid } from '@/lib/validations';

function getTeamId(request: Request): string | null {
  const teamId = new URL(request.url).searchParams.get('team_id');
  if (!teamId || !isValidUuid(teamId)) return null;
  return teamId;
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const teamId = getTeamId(request);
  if (!teamId) return NextResponse.json({ error: 'Valid team_id is required' }, { status: 400 });

  if (!(await isTeamOwnerForRequest(auth.supabase, auth.user.id, teamId))) {
    return NextResponse.json({ error: 'Only team owners can view Linear connection' }, { status: 403 });
  }

  const connection = await getLinearOAuthConnectionStatusForTeam(createAdminClient(), teamId);
  return NextResponse.json({
    team_id: teamId,
    connected: Boolean(connection),
    expires_at: connection?.expiresAt ?? null,
    scope: connection?.scope ?? null,
  });
}

export async function DELETE(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const teamId = getTeamId(request);
  if (!teamId) return NextResponse.json({ error: 'Valid team_id is required' }, { status: 400 });

  if (!(await isTeamOwnerForRequest(auth.supabase, auth.user.id, teamId))) {
    return NextResponse.json({ error: 'Only team owners can disconnect Linear' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc('disconnect_linear_for_team', { p_team_id: teamId });
  if (error) return serverErrorResponse('Failed to disconnect Linear', error);

  return NextResponse.json({ success: true, team_id: teamId, connected: false });
}
