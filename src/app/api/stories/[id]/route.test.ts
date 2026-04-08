import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { deleteStory, getStory, updateStory } from '@/storymap/service';
import { DELETE as deleteStoryRoute, GET as getStoryRoute, PUT as updateStoryRoute } from './route';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/storymap/service', () => ({
  getStory: vi.fn(),
  updateStory: vi.fn(),
  deleteStory: vi.fn(),
}));

const VALID_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('stories [id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user-1' } } as never);
  });

  it('loads a story by id', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(getStory).mockResolvedValue({ data: { id: VALID_ID, title: 'Approve invoice' }, error: null } as never);

    const response = await getStoryRoute(new Request('http://localhost/api/stories/id'), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: VALID_ID, title: 'Approve invoice' });
    expect(getStory).toHaveBeenCalledWith(client, VALID_ID);
  });

  it('returns 404 when a story is missing', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(getStory).mockResolvedValue({ data: null, error: { code: 'PGRST116' } } as never);

    const response = await getStoryRoute(new Request('http://localhost/api/stories/id'), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(response.status).toBe(404);
  });

  it('rejects placement changes through the generic update route', async () => {
    const response = await updateStoryRoute(
      new Request('http://localhost/api/stories/id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4' }),
      }),
      { params: Promise.resolve({ id: VALID_ID }) },
    );

    expect(response.status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
    expect(updateStory).not.toHaveBeenCalled();
  });

  it('allows metadata updates through the generic update route', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(updateStory).mockResolvedValue({ data: { id: VALID_ID, status: 'done' }, error: null } as never);

    const response = await updateStoryRoute(
      new Request('http://localhost/api/stories/id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      }),
      { params: Promise.resolve({ id: VALID_ID }) },
    );

    expect(response.status).toBe(200);
    expect(updateStory).toHaveBeenCalledWith(client, VALID_ID, { status: 'done' });
  });

  it('deletes a story and returns the deleted payload', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(deleteStory).mockResolvedValue({ data: { id: VALID_ID }, error: null } as never);

    const response = await deleteStoryRoute(new Request('http://localhost/api/stories/id', { method: 'DELETE' }), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, deleted: { id: VALID_ID } });
    expect(deleteStory).toHaveBeenCalledWith(client, VALID_ID);
  });
});
