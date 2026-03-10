import { NextResponse } from 'next/server';
import { createTeamSchema } from '@/app/api/teams/schemas';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { validateRequest } from '@/lib/validations';
import type { TeamWithRole } from '@/types';

export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('team_members')
    .select('role, teams(id, name, created_at, updated_at)')
    .eq('user_id', auth.user.id)
    .order('created_at');

  if (error) {
    return serverErrorResponse('Failed to fetch teams', error);
  }

  type TeamRow = { id: string; name: string; created_at: string; updated_at: string };
  const teams: TeamWithRole[] = data
    .filter((m) => m.teams)
    .map((m) => {
      const t = m.teams as unknown as TeamRow;
      return { id: t.id, name: t.name, created_at: t.created_at, updated_at: t.updated_at, role: m.role };
    });

  return NextResponse.json(teams);
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const validation = await validateRequest(request, createTeamSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data: team, error } = await supabase.rpc('create_team_with_owner', { p_name: validation.data.name }).single();
  if (error || !team) {
    return serverErrorResponse('Failed to create team', error);
  }

  return NextResponse.json(team, { status: 201 });
}
