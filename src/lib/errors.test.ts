import { describe, expect, it, vi } from 'vitest';

import { assertNever, DbErrorCode, errorMessage, notFoundResponse, serverErrorResponse } from './errors';

describe('DbErrorCode', () => {
  it('exposes expected PostgREST code for missing single row', () => {
    expect(DbErrorCode.NOT_FOUND).toBe('PGRST116');
  });
});

describe('notFoundResponse', () => {
  it('returns a 404 with resource-specific message', async () => {
    const response = notFoundResponse('Story');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Story not found' });
  });
});

describe('serverErrorResponse', () => {
  it('logs when an error is provided and returns 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cause = new Error('boom');

    const response = serverErrorResponse('Unexpected failure', cause);

    expect(spy).toHaveBeenCalledWith('Unexpected failure', cause);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Unexpected failure' });
    spy.mockRestore();
  });

  it('does not log when no error is provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    serverErrorResponse('Unexpected failure');

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('assertNever', () => {
  it('throws with serialized unexpected value', () => {
    expect(() => assertNever('bad-value' as never)).toThrow('Unexpected value: "bad-value"');
  });
});

describe('errorMessage', () => {
  it('returns Error.message for Error instances', () => {
    expect(errorMessage(new Error('Something failed'))).toBe('Something failed');
  });

  it('returns fallback for unknown values', () => {
    expect(errorMessage({ reason: 'unknown' })).toBe('An error occurred');
  });
});
