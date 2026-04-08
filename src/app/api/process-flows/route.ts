import { createProcessFlowSchema } from '@beemspec/processflow';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { listTeamsForUser } from '@/lib/teams';
import { validateRequest } from '@/lib/validations';
import { createProcessFlow, listProcessFlows } from '@/processflow/service';

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { searchParams } = new URL(request.url);
  const requestedTeamId = searchParams.get('team_id');

  const supabase = await createClient();
  let resolvedTeamId = requestedTeamId;

  const teamsResult = await listTeamsForUser(supabase, auth.user.id);
  if (teamsResult.error || !teamsResult.data) {
    return serverErrorResponse('Failed to resolve team', teamsResult.error);
  }

  if (resolvedTeamId) {
    const isAccessible = teamsResult.data.some((team) => team.team_id === resolvedTeamId);
    if (!isAccessible) {
      return NextResponse.json({ error: 'Provided team_id is not accessible to authenticated user' }, { status: 400 });
    }
  } else if (teamsResult.data.length === 1) {
    resolvedTeamId = teamsResult.data[0].team_id;
  } else if (teamsResult.data.length === 0) {
    return NextResponse.json({ error: 'No accessible teams found for authenticated user' }, { status: 400 });
  } else {
    return NextResponse.json(
      { error: 'Multiple teams found. Pass team_id explicitly.', teams: teamsResult.data },
      { status: 400 },
    );
  }

  if (!resolvedTeamId) {
    return NextResponse.json({ error: 'Failed to resolve team_id' }, { status: 400 });
  }

  const { data, error } = await listProcessFlows(supabase, resolvedTeamId);
  if (error) {
    return serverErrorResponse('Failed to load process flows', error);
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, createProcessFlowSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await createProcessFlow(supabase, validation.data);
  if (error) {
    return serverErrorResponse('Failed to create process flow', error);
  }

  return NextResponse.json(data);
}
