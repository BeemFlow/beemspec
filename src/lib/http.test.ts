import { describe, expect, it, vi } from 'vitest';

import { fetchJson, getResponseErrorMessage, readJsonSafe } from './http';

describe('readJsonSafe', () => {
  it('returns parsed payload when response is JSON', async () => {
    const response = new Response(JSON.stringify({ ok: true }), { status: 200 });

    await expect(readJsonSafe<{ ok: boolean }>(response)).resolves.toEqual({ ok: true });
  });

  it('returns null when payload is not valid JSON', async () => {
    const response = new Response('not-json', { status: 200 });

    await expect(readJsonSafe(response)).resolves.toBeNull();
  });
});

describe('getResponseErrorMessage', () => {
  it('prefers payload error when present', () => {
    expect(getResponseErrorMessage({ error: 'No access' }, 'Fallback')).toBe('No access');
  });

  it('falls back when payload has no error field', () => {
    expect(getResponseErrorMessage({ message: 'No access' }, 'Fallback')).toBe('Fallback');
  });
});

describe('fetchJson', () => {
  it('returns JSON payload for successful responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: '1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson<{ id: string }>('/api/test')).resolves.toEqual({ id: '1' });
  });

  it('throws HttpError with payload message on error responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchJson('/api/test')).rejects.toMatchObject({
      name: 'HttpError',
      message: 'Bad request',
      status: 400,
    });
  });
});
