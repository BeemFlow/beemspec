import { NextResponse } from 'next/server';
import { resolveLinearAuthTokenForTeam } from '@/integrations/linear/auth';
import { getLinearOAuthConnectionForTeam } from '@/integrations/linear/connections';
import { applySuggestedLinearSettings, resolveLinearOptions } from '@/integrations/linear/discovery';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTeamOwnerForRequest } from '@/lib/teams';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

interface IntegrationSettingsRow {
  team_id: string;
  linear_workspace_id: string | null;
  linear_team_id: string | null;
  linear_status_mapping: Record<string, string> | null;
}

function toSettingsPayload(teamId: string, row: IntegrationSettingsRow | null) {
  return {
    team_id: teamId,
    linear_workspace_id: row?.linear_workspace_id ?? null,
    linear_team_id: row?.linear_team_id ?? null,
    linear_status_mapping: row?.linear_status_mapping ?? {},
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id: teamId } = await params;
  if (!isValidUuid(teamId)) return invalidIdResponse();

  if (!(await isTeamOwnerForRequest(auth.supabase, auth.user.id, teamId))) {
    return NextResponse.json({ error: 'Only team owners can view Linear options' }, { status: 403 });
  }

  const admin = createAdminClient();

  try {
    const [connection, settingsResult] = await Promise.all([
      getLinearOAuthConnectionForTeam(admin, teamId),
      admin
        .from('integration_settings')
        .select('team_id, linear_workspace_id, linear_team_id, linear_status_mapping')
        .eq('team_id', teamId)
        .maybeSingle<IntegrationSettingsRow>(),
    ]);

    if (settingsResult.error) {
      return serverErrorResponse('Failed to load integration settings', settingsResult.error);
    }

    if (!connection) {
      return NextResponse.json({
        connected: false,
        settings: toSettingsPayload(teamId, settingsResult.data),
        options: { workspace_id: null, workspace_name: null, teams: [], projects: [], states: [] },
        applied_defaults: false,
      });
    }

    const accessToken = await resolveLinearAuthTokenForTeam(teamId);
    if (!accessToken) {
      return NextResponse.json({
        connected: false,
        settings: toSettingsPayload(teamId, settingsResult.data),
        options: { workspace_id: null, workspace_name: null, teams: [], projects: [], states: [] },
        applied_defaults: false,
      });
    }

    const options = await resolveLinearOptions(accessToken);
    const suggested = applySuggestedLinearSettings(
      {
        linearWorkspaceId: settingsResult.data?.linear_workspace_id ?? null,
        linearTeamId: settingsResult.data?.linear_team_id ?? null,
        linearStatusMapping: settingsResult.data?.linear_status_mapping ?? {},
      },
      options,
    );

    let settings = toSettingsPayload(teamId, settingsResult.data);
    if (suggested.changed) {
      const { data: upserted, error: upsertError } = await admin
        .from('integration_settings')
        .upsert(
          {
            team_id: teamId,
            linear_workspace_id: suggested.linearWorkspaceId,
            linear_team_id: suggested.linearTeamId,
            linear_status_mapping: suggested.linearStatusMapping,
          },
          { onConflict: 'team_id' },
        )
        .select('team_id, linear_workspace_id, linear_team_id, linear_status_mapping')
        .single<IntegrationSettingsRow>();

      if (upsertError) {
        return serverErrorResponse('Failed to save suggested Linear settings', upsertError);
      }

      settings = toSettingsPayload(teamId, upserted);
    }

    return NextResponse.json({
      connected: true,
      settings,
      options: {
        workspace_id: options.workspaceId,
        workspace_name: options.workspaceName ?? null,
        teams: options.teams,
        projects: options.projects,
        states: options.states,
      },
      applied_defaults: suggested.changed,
    });
  } catch (error) {
    return serverErrorResponse('Failed to load Linear options', error);
  }
}
