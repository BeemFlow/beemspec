import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { isValidUuid, pickDefined, validateRequest } from './validations';

describe('isValidUuid', () => {
  it('accepts a valid UUID v4', () => {
    expect(isValidUuid('d7f34189-5d27-4dc0-b2c5-23d11796add4')).toBe(true);
  });

  it('rejects a non-v4 UUID', () => {
    expect(isValidUuid('d7f34189-5d27-1dc0-b2c5-23d11796add4')).toBe(false);
  });
});

describe('pickDefined', () => {
  it('removes undefined keys and preserves null', () => {
    const result = pickDefined({ title: 'Story', description: null, edge_cases: undefined });

    expect(result).toEqual({ title: 'Story', description: null });
    expect(Object.hasOwn(result, 'edge_cases')).toBe(false);
  });
});

describe('validateRequest', () => {
  const schema = z.object({ name: z.string().min(1) });

  it('returns 400 for malformed JSON', async () => {
    const request = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    const result = await validateRequest(request, schema);

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.response.status).toBe(400);
    await expect(result.response.json()).resolves.toMatchObject({ error: 'Invalid JSON in request body' });
  });

  it('returns 400 when schema validation fails', async () => {
    const request = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 42 }),
    });

    const result = await validateRequest(request, schema);

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(result.response.status).toBe(400);
    await expect(result.response.json()).resolves.toMatchObject({ error: 'Validation failed' });
  });

  it('returns parsed data when validation passes', async () => {
    const request = new Request('http://localhost/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'BeemSpec' }),
    });

    const result = await validateRequest(request, schema);

    expect(result).toEqual({ success: true, data: { name: 'BeemSpec' } });
  });
});
