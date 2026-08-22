import { NextResponse } from 'next/server';
import {
  storyMapLinearSettingsResponseSchema,
  updateStoryMapLinearSettingsSchema,
} from '@/integrations/linear/adapter';
import { getLinearOAuthConnectionStatusForTeam } from '@/integrations/linear/connections';
import { DEFAULT_AUTO_IMPORT_LABELED_ISSUES, DEFAULT_LINEAR_IMPORT_LABEL } from '@/integrations/linear/settings';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { normalize } from '@/lib/strings';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isTeamOwnerForRequest } from '@/lib/teams';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';

interface StoryMapRow {
  id: string;
  team_id: string;
}

interface TeamSettingsRow {
  linear_team_id: string | null;
  linear_status_mapping: Record<string, string> | null;
}

interface StoryMapSettingsRow {
  team_id: string;
  story_map_id: string;
  linear_project_id: string | null;
  use_team_status_mapping: boolean;
  linear_status_mapping: Record<string, string> | null;
  auto_import_labeled_issues: boolean;
  import_label_name: string;
  updated_at: string;
}

const DEFAULT_IMPORT_LABEL_NAME = DEFAULT_LINEAR_IMPORT_LABEL;

async function loadStoryMapContext(storyMapId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('story_maps')
    .select('id, team_id')
    .eq('id', storyMapId)
    .single<StoryMapRow>();

  return { supabase, data, error };
}

function toNullable(input: string | null | undefined): string | null {
  return normalize(input ?? null);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id: storyMapId } = await params;
  if (!isValidUuid(storyMapId)) return invalidIdResponse();

  const { supabase, data: storyMap, error: storyMapError } = await loadStoryMapContext(storyMapId);
  if (storyMapError) {
    if (storyMapError.code === DbErrorCode.NOT_FOUND) return notFoundResponse('Story map');
    return serverErrorResponse('Failed to load story map', storyMapError);
  }
  if (!storyMap) return notFoundResponse('Story map');

  const [teamSettingsResult, storyMapSettingsResult, canEdit, connection] = await Promise.all([
    supabase
      .from('integration_settings')
      .select('linear_team_id, linear_status_mapping')
      .eq('team_id', storyMap.team_id)
      .maybeSingle<TeamSettingsRow>(),
    supabase
      .from('story_map_integration_settings')
      .select(
        'team_id, story_map_id, linear_project_id, use_team_status_mapping, linear_status_mapping, auto_import_labeled_issues, import_label_name, updated_at',
      )
      .eq('story_map_id', storyMapId)
      .maybeSingle<StoryMapSettingsRow>(),
    isTeamOwnerForRequest(auth.user.id, storyMap.team_id),
    getLinearOAuthConnectionStatusForTeam(createAdminClient(), storyMap.team_id),
  ]);

  if (teamSettingsResult.error) {
    return serverErrorResponse('Failed to load team integration settings', teamSettingsResult.error);
  }

  if (storyMapSettingsResult.error) {
    return serverErrorResponse('Failed to load story map integration settings', storyMapSettingsResult.error);
  }

  const teamSettings = teamSettingsResult.data;
  const storyMapSettings = storyMapSettingsResult.data;
  return NextResponse.json(
    storyMapLinearSettingsResponseSchema.parse({
      story_map_id: storyMapId,
      team_id: storyMap.team_id,
      can_edit: canEdit,
      team_settings: {
        linear_connected: Boolean(connection),
        linear_team_id: teamSettings?.linear_team_id ?? null,
        linear_status_mapping: teamSettings?.linear_status_mapping ?? {},
      },
      story_map_settings: {
        linear_project_id: storyMapSettings?.linear_project_id ?? null,
        use_team_status_mapping: storyMapSettings?.use_team_status_mapping ?? true,
        linear_status_mapping: storyMapSettings?.linear_status_mapping ?? {},
        auto_import_labeled_issues: storyMapSettings?.auto_import_labeled_issues ?? DEFAULT_AUTO_IMPORT_LABELED_ISSUES,
        import_label_name: toNullable(storyMapSettings?.import_label_name) ?? DEFAULT_IMPORT_LABEL_NAME,
        updated_at: storyMapSettings?.updated_at ?? null,
      },
      effective_settings: {
        linear_project_id: toNullable(storyMapSettings?.linear_project_id),
        linear_status_mapping:
          storyMapSettings?.use_team_status_mapping === false
            ? (storyMapSettings?.linear_status_mapping ?? {})
            : { ...(teamSettings?.linear_status_mapping ?? {}), ...(storyMapSettings?.linear_status_mapping ?? {}) },
        auto_import_labeled_issues: storyMapSettings?.auto_import_labeled_issues ?? DEFAULT_AUTO_IMPORT_LABELED_ISSUES,
        import_label_name: toNullable(storyMapSettings?.import_label_name) ?? DEFAULT_IMPORT_LABEL_NAME,
      },
    }),
  );
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id: storyMapId } = await params;
  if (!isValidUuid(storyMapId)) return invalidIdResponse();

  const validation = await validateRequest(request, updateStoryMapLinearSettingsSchema);
  if (!validation.success) return validation.response;

  const { supabase, data: storyMap, error: storyMapError } = await loadStoryMapContext(storyMapId);
  if (storyMapError) {
    if (storyMapError.code === DbErrorCode.NOT_FOUND) return notFoundResponse('Story map');
    return serverErrorResponse('Failed to load story map', storyMapError);
  }
  if (!storyMap) return notFoundResponse('Story map');

  if (!(await isTeamOwnerForRequest(auth.user.id, storyMap.team_id))) {
    return NextResponse.json({ error: 'Only team owners can update story map Linear settings' }, { status: 403 });
  }

  const linearProjectId = toNullable(validation.data.linear_project_id);
  const useTeamStatusMapping = validation.data.use_team_status_mapping ?? true;
  const linearStatusMapping = validation.data.linear_status_mapping ?? {};
  const autoImportLabeledIssues = validation.data.auto_import_labeled_issues ?? DEFAULT_AUTO_IMPORT_LABELED_ISSUES;
  const importLabelName = toNullable(validation.data.import_label_name) ?? DEFAULT_IMPORT_LABEL_NAME;

  const { data, error } = await supabase
    .from('story_map_integration_settings')
    .upsert(
      {
        team_id: storyMap.team_id,
        story_map_id: storyMapId,
        linear_project_id: linearProjectId,
        use_team_status_mapping: useTeamStatusMapping,
        linear_status_mapping: linearStatusMapping,
        auto_import_labeled_issues: autoImportLabeledIssues,
        import_label_name: importLabelName,
      },
      { onConflict: 'story_map_id' },
    )
    .select(
      'team_id, story_map_id, linear_project_id, use_team_status_mapping, linear_status_mapping, auto_import_labeled_issues, import_label_name, updated_at',
    )
    .single<StoryMapSettingsRow>();

  if (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : null;
    if (code === '23505' && linearProjectId) {
      return NextResponse.json(
        { error: 'This Linear project is already linked to another story map in this team' },
        { status: 409 },
      );
    }
    return serverErrorResponse('Failed to save story map Linear settings', error);
  }

  return NextResponse.json(data);
}
