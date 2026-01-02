import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { createTeamSchema, validateRequest } from '@/lib/validations';
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

  // Create team
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .insert({ name: validation.data.name })
    .select()
    .single();

  if (teamError) {
    return serverErrorResponse('Failed to create team', teamError);
  }

  // Add creator as owner
  const { error: memberError } = await supabase
    .from('team_members')
    .insert({ team_id: team.id, user_id: auth.user.id, role: 'owner' });

  if (memberError) {
    // Rollback team creation
    await supabase.from('teams').delete().eq('id', team.id);
    return serverErrorResponse('Failed to add owner', memberError);
  }

  return NextResponse.json(team, { status: 201 });
}
