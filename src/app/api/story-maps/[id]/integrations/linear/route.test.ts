import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isTeamOwnerForRequest } from '@/lib/teams';
import { GET, PUT } from './route';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/teams', () => ({
  isTeamOwnerForRequest: vi.fn(),
}));

const STORY_MAP_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';
const TEAM_ID = 'd2c465cb-48ce-4366-8899-50db3ec72c56';

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('story map linear integration settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('returns story map settings with effective fallback', async () => {
    const storyMapSingle = vi.fn().mockResolvedValue({ data: { id: STORY_MAP_ID, team_id: TEAM_ID }, error: null });
    const storyMapEq = vi.fn().mockReturnValue({ single: storyMapSingle });
    const storyMapSelect = vi.fn().mockReturnValue({ eq: storyMapEq });

    const teamMaybeSingle = vi.fn().mockResolvedValue({
      data: { linear_team_id: 'linear_team_1', linear_project_id: 'team_project_1', linear_state_id: 'team_state_1' },
      error: null,
    });
    const teamEq = vi.fn().mockReturnValue({ maybeSingle: teamMaybeSingle });
    const teamSelect = vi.fn().mockReturnValue({ eq: teamEq });

    const mapMaybeSingle = vi.fn().mockResolvedValue({
      data: { story_map_id: STORY_MAP_ID, linear_project_id: 'map_project_1', linear_state_id: null, updated_at: null },
      error: null,
    });
    const mapEq = vi.fn().mockReturnValue({ maybeSingle: mapMaybeSingle });
    const mapSelect = vi.fn().mockReturnValue({ eq: mapEq });

    const from = vi.fn((table: string) => {
      if (table === 'story_maps') return { select: storyMapSelect };
      if (table === 'integration_settings') return { select: teamSelect };
      if (table === 'story_map_integration_settings') return { select: mapSelect };
      return {};
    });

    vi.mocked(isTeamOwnerForRequest).mockResolvedValue(true);
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await GET(new Request('http://localhost/api/test'), {
      params: Promise.resolve({ id: STORY_MAP_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      team_id: TEAM_ID,
      story_map_settings: { linear_project_id: 'map_project_1', linear_state_id: null },
      effective_settings: { linear_project_id: 'map_project_1', linear_state_id: 'team_state_1' },
    });
  });

  it('clears story map overrides when both values are null', async () => {
    const storyMapSingle = vi.fn().mockResolvedValue({ data: { id: STORY_MAP_ID, team_id: TEAM_ID }, error: null });
    const storyMapEq = vi.fn().mockReturnValue({ single: storyMapSingle });
    const storyMapSelect = vi.fn().mockReturnValue({ eq: storyMapEq });

    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn().mockReturnValue({ eq: deleteEq });

    const from = vi.fn((table: string) => {
      if (table === 'story_maps') return { select: storyMapSelect };
      if (table === 'story_map_integration_settings') return { delete: del };
      return {};
    });

    vi.mocked(isTeamOwnerForRequest).mockResolvedValue(true);
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await PUT(jsonRequest({ linear_project_id: null, linear_state_id: null }), {
      params: Promise.resolve({ id: STORY_MAP_ID }),
    });

    expect(del).toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      story_map_id: STORY_MAP_ID,
      linear_project_id: null,
      linear_state_id: null,
    });
  });
});
