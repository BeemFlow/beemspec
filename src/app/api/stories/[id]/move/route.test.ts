import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { moveStory } from '@/storymap/service';
import { PUT } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/storymap/service', () => ({ moveStory: vi.fn() }));

const STORY_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('stories [id] move route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user-1' } } as never);
  });

  it('moves a story through the service in normal mode', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(moveStory).mockResolvedValue({ data: null, error: null } as never);

    const payload = {
      target_task_id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4',
      target_release_id: '87c65304-2faf-4ccf-bad5-3d0cd632bffd',
      target_order: ['f2707254-c4f4-49a1-bbdb-b3b33a36ac71'],
    };
    const response = await PUT(
      new Request('http://localhost/api/stories/id/move', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      { params: Promise.resolve({ id: STORY_ID }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(moveStory).toHaveBeenCalledWith(client, STORY_ID, payload);
  });

  it('rejects invalid payloads', async () => {
    const response = await PUT(
      new Request('http://localhost/api/stories/id/move', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target_task_id: 'bad', target_release_id: null, target_order: [] }),
      }),
      { params: Promise.resolve({ id: 'story-1' }) },
    );

    expect(response.status).toBe(400);
    expect(moveStory).not.toHaveBeenCalled();
  });

  it('returns the auth response when the request is unauthorized', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      success: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    } as never);

    const response = await PUT(new Request('http://localhost/api/stories/id/move', { method: 'PUT' }), {
      params: Promise.resolve({ id: STORY_ID }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(createClient).not.toHaveBeenCalled();
    expect(moveStory).not.toHaveBeenCalled();
  });

  it('returns a server error response when the move service fails', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(moveStory).mockResolvedValue({
      data: null,
      error: { message: 'rpc failed' },
    } as never);

    const response = await PUT(
      new Request('http://localhost/api/stories/id/move', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          target_task_id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4',
          target_release_id: null,
          target_order: ['f2707254-c4f4-49a1-bbdb-b3b33a36ac71'],
        }),
      }),
      { params: Promise.resolve({ id: STORY_ID }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to move story' });
  });
});
