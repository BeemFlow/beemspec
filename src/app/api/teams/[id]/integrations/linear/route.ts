import { NextResponse } from 'next/server';
import { domainRuntime } from '@/domains/runtime';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import {
  invalidIdResponse,
  isValidUuid,
  updateLinearIntegrationSettingsSchema,
  validateRequest,
} from '@/lib/validations';

function normalizeText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await domainRuntime.teams.auth.requireAuth();
  if (!auth.success) return auth.response;

  const { id: teamId } = await params;
  if (!isValidUuid(teamId)) return invalidIdResponse();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('integration_settings')
    .select('team_id, linear_workspace_id, linear_team_id, linear_project_id, linear_state_id, updated_at')
    .eq('team_id', teamId)
    .maybeSingle();

  if (error) {
    return serverErrorResponse('Failed to load integration settings', error);
  }

  return NextResponse.json(data ?? null);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await domainRuntime.teams.auth.requireAuth();
  if (!auth.success) return auth.response;

  const { id: teamId } = await params;
  if (!isValidUuid(teamId)) return invalidIdResponse();

  const validation = await validateRequest(request, updateLinearIntegrationSettingsSchema);
  if (!validation.success) return validation.response;

  const payload = {
    team_id: teamId,
    linear_workspace_id: normalizeText(validation.data.linear_workspace_id),
    linear_team_id: normalizeText(validation.data.linear_team_id),
    linear_project_id: normalizeText(validation.data.linear_project_id),
    linear_state_id: normalizeText(validation.data.linear_state_id),
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('integration_settings')
    .upsert(payload, { onConflict: 'team_id' })
    .select('team_id, linear_workspace_id, linear_team_id, linear_project_id, linear_state_id, updated_at')
    .single();

  if (error) {
    return serverErrorResponse('Failed to save integration settings', error);
  }

  return NextResponse.json(data);
}
