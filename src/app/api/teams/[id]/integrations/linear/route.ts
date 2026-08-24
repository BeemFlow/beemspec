import { NextResponse } from 'next/server';
import { updateLinearIntegrationSettingsSchema } from '@/integrations/linear/adapter';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { normalize } from '@/lib/strings';
import { isTeamOwnerForRequest } from '@/lib/teams';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id: teamId } = await params;
  if (!isValidUuid(teamId)) return invalidIdResponse();

  const supabase = auth.supabase;
  const { data, error } = await supabase
    .from('integration_settings')
    .select('team_id, linear_workspace_id, linear_team_id, linear_status_mapping, updated_at')
    .eq('team_id', teamId)
    .maybeSingle();

  if (error) {
    return serverErrorResponse('Failed to load integration settings', error);
  }

  return NextResponse.json(data ?? null);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id: teamId } = await params;
  if (!isValidUuid(teamId)) return invalidIdResponse();

  if (!(await isTeamOwnerForRequest(auth.supabase, auth.user.id, teamId))) {
    return NextResponse.json({ error: 'Only team owners can update Linear settings' }, { status: 403 });
  }

  const supabase = auth.supabase;

  const validation = await validateRequest(request, updateLinearIntegrationSettingsSchema);
  if (!validation.success) return validation.response;

  const payload = {
    team_id: teamId,
    linear_workspace_id: normalize(validation.data.linear_workspace_id),
    linear_team_id: normalize(validation.data.linear_team_id),
    linear_status_mapping: validation.data.linear_status_mapping ?? {},
  };

  const { data, error } = await supabase
    .from('integration_settings')
    .upsert(payload, { onConflict: 'team_id' })
    .select('team_id, linear_workspace_id, linear_team_id, linear_status_mapping, updated_at')
    .single();

  if (error) {
    return serverErrorResponse('Failed to save integration settings', error);
  }

  return NextResponse.json(data);
}
