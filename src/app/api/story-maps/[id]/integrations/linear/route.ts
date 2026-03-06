import { updateStoryMapLinearSettingsSchema } from '@beemspec/linear';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { normalize } from '@/lib/strings';
import { createClient } from '@/lib/supabase/server';
import { isTeamOwnerForRequest } from '@/lib/teams';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';

interface StoryMapRow {
  id: string;
  team_id: string;
}

interface TeamSettingsRow {
  linear_team_id: string | null;
  linear_project_id: string | null;
  linear_state_id: string | null;
}

interface StoryMapSettingsRow {
  story_map_id: string;
  linear_project_id: string | null;
  linear_state_id: string | null;
  updated_at: string;
}

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

  const [teamSettingsResult, storyMapSettingsResult, canEdit] = await Promise.all([
    supabase
      .from('integration_settings')
      .select('linear_team_id, linear_project_id, linear_state_id')
      .eq('team_id', storyMap.team_id)
      .maybeSingle<TeamSettingsRow>(),
    supabase
      .from('story_map_integration_settings')
      .select('story_map_id, linear_project_id, linear_state_id, updated_at')
      .eq('story_map_id', storyMapId)
      .maybeSingle<StoryMapSettingsRow>(),
    isTeamOwnerForRequest(auth.user.id, storyMap.team_id),
  ]);

  if (teamSettingsResult.error) {
    return serverErrorResponse('Failed to load team integration settings', teamSettingsResult.error);
  }

  if (storyMapSettingsResult.error) {
    return serverErrorResponse('Failed to load story map integration settings', storyMapSettingsResult.error);
  }

  const teamSettings = teamSettingsResult.data;
  const storyMapSettings = storyMapSettingsResult.data;
  return NextResponse.json({
    story_map_id: storyMapId,
    team_id: storyMap.team_id,
    can_edit: canEdit,
    team_settings: {
      linear_team_id: teamSettings?.linear_team_id ?? null,
      linear_project_id: teamSettings?.linear_project_id ?? null,
      linear_state_id: teamSettings?.linear_state_id ?? null,
    },
    story_map_settings: {
      linear_project_id: storyMapSettings?.linear_project_id ?? null,
      linear_state_id: storyMapSettings?.linear_state_id ?? null,
      updated_at: storyMapSettings?.updated_at ?? null,
    },
    effective_settings: {
      linear_project_id: toNullable(storyMapSettings?.linear_project_id) ?? toNullable(teamSettings?.linear_project_id),
      linear_state_id: toNullable(storyMapSettings?.linear_state_id) ?? toNullable(teamSettings?.linear_state_id),
    },
  });
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
  const linearStateId = toNullable(validation.data.linear_state_id);

  if (!linearProjectId && !linearStateId) {
    const { error } = await supabase.from('story_map_integration_settings').delete().eq('story_map_id', storyMapId);
    if (error) return serverErrorResponse('Failed to clear story map Linear settings', error);

    return NextResponse.json({
      story_map_id: storyMapId,
      linear_project_id: null,
      linear_state_id: null,
      updated_at: null,
    });
  }

  const { data, error } = await supabase
    .from('story_map_integration_settings')
    .upsert(
      {
        story_map_id: storyMapId,
        linear_project_id: linearProjectId,
        linear_state_id: linearStateId,
      },
      { onConflict: 'story_map_id' },
    )
    .select('story_map_id, linear_project_id, linear_state_id, updated_at')
    .single<StoryMapSettingsRow>();

  if (error) return serverErrorResponse('Failed to save story map Linear settings', error);

  return NextResponse.json(data);
}
