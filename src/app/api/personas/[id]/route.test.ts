import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { deletePersona, updatePersona } from '@/storymap/service';
import { DELETE, PUT } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/storymap/service', () => ({ deletePersona: vi.fn(), updatePersona: vi.fn() }));

const PERSONA_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('personas [id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockImplementation(
      async () => ({ success: true, user: { id: 'user-1' }, supabase: await createClient() }) as never,
    );
  });

  it('updates a persona and returns the saved payload', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(updatePersona).mockResolvedValue({ data: { id: PERSONA_ID, name: 'Director' }, error: null } as never);

    const response = await PUT(
      new Request('http://localhost/api/personas/id', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Director' }),
      }),
      { params: Promise.resolve({ id: PERSONA_ID }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: PERSONA_ID, name: 'Director' });
    expect(updatePersona).toHaveBeenCalledWith(client, PERSONA_ID, { name: 'Director' });
  });

  it('returns the auth response when the update request is unauthorized', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      success: false,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
    } as never);

    const response = await PUT(new Request('http://localhost/api/personas/id', { method: 'PUT' }), {
      params: Promise.resolve({ id: PERSONA_ID }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(updatePersona).not.toHaveBeenCalled();
  });

  it('rejects invalid persona ids before updating', async () => {
    const response = await PUT(
      new Request('http://localhost/api/personas/id', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Director' }),
      }),
      { params: Promise.resolve({ id: 'bad-id' }) },
    );

    expect(response.status).toBe(400);
    expect(updatePersona).not.toHaveBeenCalled();
  });

  it('returns 404 when updating a missing persona', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(updatePersona).mockResolvedValue({ data: null, error: { code: 'PGRST116' } } as never);

    const response = await PUT(
      new Request('http://localhost/api/personas/id', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Director' }),
      }),
      { params: Promise.resolve({ id: PERSONA_ID }) },
    );

    expect(response.status).toBe(404);
  });

  it('returns 500 when updating a persona fails unexpectedly', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(updatePersona).mockResolvedValue({ data: null, error: { message: 'db down' } } as never);

    const response = await PUT(
      new Request('http://localhost/api/personas/id', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Director' }),
      }),
      { params: Promise.resolve({ id: PERSONA_ID }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to update persona' });
  });

  it('deletes a persona and returns the removed payload', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(deletePersona).mockResolvedValue({ data: { id: PERSONA_ID }, error: null } as never);

    const response = await DELETE(new Request('http://localhost/api/personas/id', { method: 'DELETE' }), {
      params: Promise.resolve({ id: PERSONA_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, deleted: { id: PERSONA_ID } });
  });

  it('returns 500 when deleting a persona fails unexpectedly', async () => {
    const client = {};
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(deletePersona).mockResolvedValue({ data: null, error: { message: 'db down' } } as never);

    const response = await DELETE(new Request('http://localhost/api/personas/id', { method: 'DELETE' }), {
      params: Promise.resolve({ id: PERSONA_ID }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to delete persona' });
  });
});
