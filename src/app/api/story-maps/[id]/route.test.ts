import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { DELETE as deleteStoryMapById, GET as getStoryMapById, PUT as putStoryMapById } from './route';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

const VALID_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

function createStoryMapGetClient() {
  const storyMapSingle = vi.fn().mockResolvedValue({
    data: { id: VALID_ID, name: 'Map A', description: null, context_markdown: '## Goals' },
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
    data: [{ id: 'r1', name: 'Release 1', context_markdown: '## Scope' }],
    error: null,
  });
  const releasesEq = vi.fn().mockReturnValue({ order: releasesOrder });
  const releasesSelect = vi.fn().mockReturnValue({ eq: releasesEq });

  const personasOrder = vi.fn().mockResolvedValue({
    data: [{ id: 'p1', name: 'Admin' }],
    error: null,
  });
  const personasEq = vi.fn().mockReturnValue({ order: personasOrder });
  const personasSelect = vi.fn().mockReturnValue({ eq: personasEq });

  const from = vi.fn((table: string) => {
    if (table === 'story_maps') return { select: storyMapSelect };
    if (table === 'activities') return { select: activitiesSelect };
    if (table === 'releases') return { select: releasesSelect };
    if (table === 'personas') return { select: personasSelect };
    throw new Error(`Unexpected table: ${table}`);
  });

  return { client: { from }, from, personasOrder };
}

describe('story maps [id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user' } } as never);
  });

  it('returns full story map payload including personas', async () => {
    const { client, from, personasOrder } = createStoryMapGetClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const response = await getStoryMapById(new Request('http://localhost/api/story-maps/id'), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: VALID_ID,
      name: 'Map A',
      description: null,
      context_markdown: '## Goals',
      activities: [{ id: 'a1', tasks: [] }],
      releases: [{ id: 'r1', name: 'Release 1', context_markdown: '## Scope' }],
      personas: [{ id: 'p1', name: 'Admin' }],
    });
    expect(from).toHaveBeenCalledWith('story_maps');
    expect(from).toHaveBeenCalledWith('activities');
    expect(from).toHaveBeenCalledWith('releases');
    expect(from).toHaveBeenCalledWith('personas');
    expect(personasOrder).toHaveBeenCalledWith('created_at');
  });

  it('returns 400 for invalid story map id', async () => {
    const response = await getStoryMapById(new Request('http://localhost/api/story-maps/id'), {
      params: Promise.resolve({ id: 'invalid-id' }),
    });

    expect(response.status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('returns 404 when the story map is missing', async () => {
    const missingClient = {
      from: vi.fn((table: string) => {
        if (table === 'story_maps') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi
                .fn()
                .mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) }),
            }),
          };
        }
        if (table === 'activities') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }),
                }),
              }),
            }),
          };
        }
        if (table === 'releases' || table === 'personas') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }),
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    vi.mocked(createClient).mockResolvedValue(missingClient as never);

    const response = await getStoryMapById(new Request('http://localhost/api/story-maps/id'), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(response.status).toBe(404);
  });

  it('updates story map context markdown', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: VALID_ID, name: 'Map A', context_markdown: '## Updated' },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn((table: string) => {
      if (table === 'story_maps') return { update };
      throw new Error(`Unexpected table: ${table}`);
    });
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await putStoryMapById(
      new Request('http://localhost/api/story-maps/id', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ context_markdown: '## Updated' }),
      }),
      { params: Promise.resolve({ id: VALID_ID }) },
    );

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ context_markdown: '## Updated' });
  });

  it('deletes a story map and returns the deleted payload', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: VALID_ID }, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const eq = vi.fn().mockReturnValue({ select });
    const remove = vi.fn().mockReturnValue({ eq });
    const from = vi.fn((table: string) => {
      if (table === 'story_maps') return { delete: remove };
      throw new Error(`Unexpected table: ${table}`);
    });
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await deleteStoryMapById(new Request('http://localhost/api/story-maps/id', { method: 'DELETE' }), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, deleted: { id: VALID_ID } });
  });
});
