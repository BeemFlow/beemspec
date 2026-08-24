import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { moveTask } from '@/storymap/service';
import { PUT } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/storymap/service', () => ({ moveTask: vi.fn() }));

const TASK_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('tasks [id] move route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation(
      async () => ({ success: true, user: { id: 'user-1' }, supabase: await createClient() }) as never,
    );
  });

  it('moves a task through the storymap service', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(moveTask).mockResolvedValue({ data: null, error: null } as never);

    const payload = {
      target_activity_id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4',
      target_order: ['87c65304-2faf-4ccf-bad5-3d0cd632bffd'],
    };
    const response = await PUT(
      new Request('http://localhost/api/tasks/id/move', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(moveTask).toHaveBeenCalledWith(client, TASK_ID, payload);
  });

  it('rejects invalid move payloads before calling the service', async () => {
    const response = await PUT(
      new Request('http://localhost/api/tasks/id/move', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target_activity_id: 'not-a-uuid', target_order: [] }),
      }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );

    expect(response.status).toBe(400);
    expect(moveTask).not.toHaveBeenCalled();
  });

  it('returns the auth response when the request is unauthorized', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      success: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    } as never);

    const response = await PUT(new Request('http://localhost/api/tasks/id/move', { method: 'PUT' }), {
      params: Promise.resolve({ id: TASK_ID }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(createClient).not.toHaveBeenCalled();
    expect(moveTask).not.toHaveBeenCalled();
  });

  it('returns a server error response when the move service fails', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(moveTask).mockResolvedValue({ data: null, error: { message: 'rpc failed' } } as never);

    const response = await PUT(
      new Request('http://localhost/api/tasks/id/move', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          target_activity_id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4',
          target_order: ['87c65304-2faf-4ccf-bad5-3d0cd632bffd'],
        }),
      }),
      { params: Promise.resolve({ id: TASK_ID }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to move task' });
  });
});
