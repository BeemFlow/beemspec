import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { deleteTask, updateTask } from '@/storymap/service';
import { DELETE as deleteTaskRoute, PUT as updateTaskRoute } from './route';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/storymap/service', () => ({
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));

const VALID_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('tasks [id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user-1' } } as never);
  });

  it('rejects parent changes through the generic update route', async () => {
    const response = await updateTaskRoute(
      new Request('http://localhost/api/tasks/id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activity_id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4' }),
      }),
      { params: Promise.resolve({ id: VALID_ID }) },
    );

    expect(response.status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
    expect(updateTask).not.toHaveBeenCalled();
  });

  it('allows metadata updates through the generic update route', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(updateTask).mockResolvedValue({ data: { id: VALID_ID, name: 'Updated task' }, error: null } as never);

    const response = await updateTaskRoute(
      new Request('http://localhost/api/tasks/id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated task' }),
      }),
      { params: Promise.resolve({ id: VALID_ID }) },
    );

    expect(response.status).toBe(200);
    expect(updateTask).toHaveBeenCalledWith(client, VALID_ID, { name: 'Updated task' });
  });

  it('deletes a task and returns the deleted payload', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(deleteTask).mockResolvedValue({ data: { id: VALID_ID }, error: null } as never);

    const response = await deleteTaskRoute(new Request('http://localhost/api/tasks/id', { method: 'DELETE' }), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, deleted: { id: VALID_ID } });
    expect(deleteTask).toHaveBeenCalledWith(client, VALID_ID);
  });
});
