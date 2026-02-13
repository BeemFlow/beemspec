import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { GET as getStoryMapById } from './route';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const VALID_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

function createStoryMapGetClient() {
  const storyMapSingle = vi.fn().mockResolvedValue({
    data: { id: VALID_ID, name: 'Map A' },
    error: null,
  });
  const storyMapEq = vi.fn().mockReturnValue({ single: storyMapSingle });
  const storyMapSelect = vi.fn().mockReturnValue({ eq: storyMapEq });

  const activitiesOrder3 = vi.fn().mockResolvedValue({
    data: [{ id: 'a1', tasks: [] }],
    error: null,
  });
  const activitiesOrder2 = vi.fn().mockReturnValue({ order: activitiesOrder3 });
  const activitiesOrder1 = vi.fn().mockReturnValue({ order: activitiesOrder2 });
  const activitiesEq = vi.fn().mockReturnValue({ order: activitiesOrder1 });
  const activitiesSelect = vi.fn().mockReturnValue({ eq: activitiesEq });

  const releasesOrder = vi.fn().mockResolvedValue({
    data: [{ id: 'r1', name: 'Release 1' }],
    error: null,
  });
  const releasesEq = vi.fn().mockReturnValue({ order: releasesOrder });
  const releasesSelect = vi.fn().mockReturnValue({ eq: releasesEq });

  const from = vi.fn((table: string) => {
    if (table === 'story_maps') return { select: storyMapSelect };
    if (table === 'activities') return { select: activitiesSelect };
    if (table === 'releases') return { select: releasesSelect };
    throw new Error(`Unexpected table: ${table}`);
  });

  return { client: { from }, from };
}

describe('story maps [id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user' } } as never);
  });

  it('returns full story map payload without personas query', async () => {
    const { client, from } = createStoryMapGetClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const response = await getStoryMapById(new Request('http://localhost/api/story-maps/id'), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: VALID_ID,
      name: 'Map A',
      activities: [{ id: 'a1', tasks: [] }],
      releases: [{ id: 'r1', name: 'Release 1' }],
    });
    expect(from).toHaveBeenCalledWith('story_maps');
    expect(from).toHaveBeenCalledWith('activities');
    expect(from).toHaveBeenCalledWith('releases');
    expect(from).not.toHaveBeenCalledWith('personas');
  });

  it('returns 400 for invalid story map id', async () => {
    const response = await getStoryMapById(new Request('http://localhost/api/story-maps/id'), {
      params: Promise.resolve({ id: 'invalid-id' }),
    });

    expect(response.status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });
});
