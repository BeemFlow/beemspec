import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireAuth } from '@/lib/auth';
import { requireAuthWithUuidParams } from './route-guards';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

const VALID_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('requireAuthWithUuidParams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns auth failure response when user is unauthorized', async () => {
    vi.mocked(requireAuth).mockResolvedValue({
      success: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    } as never);

    const result = await requireAuthWithUuidParams(Promise.resolve({ id: VALID_ID }), ['id']);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.response.status).toBe(401);
  });

  it('returns invalid id response when uuid validation fails', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'u1', email: 'a@b.com' } } as never);

    const result = await requireAuthWithUuidParams(Promise.resolve({ id: 'invalid' }), ['id']);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.response.status).toBe(400);
  });

  it('returns user and params when auth and uuid checks pass', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'u1', email: 'a@b.com' } } as never);

    const result = await requireAuthWithUuidParams(Promise.resolve({ id: VALID_ID, inviteId: VALID_ID }), [
      'id',
      'inviteId',
    ]);

    expect(result).toEqual({
      success: true,
      user: { id: 'u1', email: 'a@b.com' },
      params: { id: VALID_ID, inviteId: VALID_ID },
    });
  });
});
