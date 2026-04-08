import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { GET as getStoryMaps, POST as postStoryMap } from './route';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const TEAM_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

function createStoryMapsClient(options?: { teams?: string[] }) {
  const memberships = (options?.teams ?? [TEAM_ID]).map((teamId) => ({ team_id: teamId, role: 'owner' }));
  const teams = (options?.teams ?? [TEAM_ID]).map((teamId, idx) => ({ id: teamId, name: `Team ${idx + 1}` }));

  const teamMembersEq = vi.fn().mockResolvedValue({ data: memberships, error: null });
  const teamMembersSelect = vi.fn().mockReturnValue({ eq: teamMembersEq });

  const teamsIn = vi.fn().mockResolvedValue({ data: teams, error: null });
  const teamsSelect = vi.fn().mockReturnValue({ in: teamsIn });

  const storyMapsOrder = vi.fn().mockResolvedValue({ data: [{ id: 'map-1', name: 'Core' }], error: null });
  const storyMapsEq = vi.fn().mockReturnValue({ order: storyMapsOrder });
  const storyMapsSelect = vi.fn().mockReturnValue({ eq: storyMapsEq });

  const from = vi.fn((table: string) => {
    if (table === 'team_members') return { select: teamMembersSelect };
    if (table === 'teams') return { select: teamsSelect };
    if (table === 'story_maps') return { select: storyMapsSelect };
    throw new Error(`Unexpected table: ${table}`);
  });

  return { client: { from }, storyMapsEq };
}

describe('story maps route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user-1' } } as never);
  });

  it('lists story maps for explicit accessible team', async () => {
    const { client, storyMapsEq } = createStoryMapsClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const response = await getStoryMaps(new Request(`http://localhost/api/story-maps?team_id=${TEAM_ID}`));

    expect(response.status).toBe(200);
    expect(storyMapsEq).toHaveBeenCalledWith('team_id', TEAM_ID);
  });

  it('auto-resolves team when user has exactly one team', async () => {
    const { client, storyMapsEq } = createStoryMapsClient({ teams: [TEAM_ID] });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const response = await getStoryMaps(new Request('http://localhost/api/story-maps'));

    expect(response.status).toBe(200);
    expect(storyMapsEq).toHaveBeenCalledWith('team_id', TEAM_ID);
  });

  it('returns 400 when team_id is omitted and user has multiple teams', async () => {
    const { client } = createStoryMapsClient({
      teams: ['d7f34189-5d27-4dc0-b2c5-23d11796add4', '34e8bb98-8f40-4331-8df2-8f83fd8c7af4'],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const response = await getStoryMaps(new Request('http://localhost/api/story-maps'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: 'Multiple teams found. Pass team_id explicitly.' }),
    );
  });

  it('returns 400 when the requested team is not accessible', async () => {
    const { client } = createStoryMapsClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const response = await getStoryMaps(
      new Request('http://localhost/api/story-maps?team_id=34e8bb98-8f40-4331-8df2-8f83fd8c7af4'),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Provided team_id is not accessible to authenticated user',
    });
  });

  it('returns 400 when the user has no accessible teams', async () => {
    const { client } = createStoryMapsClient({ teams: [] });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const response = await getStoryMaps(new Request('http://localhost/api/story-maps'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'No accessible teams found for authenticated user' });
  });

  it('creates a story map with context markdown', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'map-1', name: 'Core', context_markdown: '## Goals' },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn((table: string) => {
      if (table === 'story_maps') return { insert };
      throw new Error(`Unexpected table: ${table}`);
    });
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await postStoryMap(
      new Request('http://localhost/api/story-maps', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          team_id: TEAM_ID,
          name: 'Core',
          context_markdown: '## Goals',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith({
      team_id: TEAM_ID,
      name: 'Core',
      description: null,
      context_markdown: '## Goals',
    });
  });
});
