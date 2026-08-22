import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processLinearSyncBatch } from '@/integrations/linear/jobs';
import { env } from '@/lib/env';
import { POST } from './route';

vi.mock('@/integrations/linear/jobs', () => ({ processLinearSyncBatch: vi.fn() }));
vi.mock('@/lib/env', () => ({ env: { integrationSyncSecret: vi.fn() } }));

describe('internal Linear sync drain route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(env.integrationSyncSecret).mockReturnValue('drain-secret');
  });

  it('does not expose the worker when no secret is configured', async () => {
    vi.mocked(env.integrationSyncSecret).mockReturnValue(null);

    const response = await POST(new Request('http://localhost/api/internal/integrations/linear/drain'));

    expect(response.status).toBe(404);
    expect(processLinearSyncBatch).not.toHaveBeenCalled();
  });

  it('rejects an invalid bearer token', async () => {
    const response = await POST(
      new Request('http://localhost/api/internal/integrations/linear/drain', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong' },
      }),
    );

    expect(response.status).toBe(401);
    expect(processLinearSyncBatch).not.toHaveBeenCalled();
  });

  it('drains a bounded batch for an authorized scheduler', async () => {
    vi.mocked(processLinearSyncBatch).mockResolvedValue({
      claimed: 2,
      succeeded: 1,
      retried: 1,
      failed: 0,
      stale: 0,
    });

    const response = await POST(
      new Request('http://localhost/api/internal/integrations/linear/drain', {
        method: 'POST',
        headers: { authorization: 'Bearer drain-secret' },
      }),
    );

    expect(processLinearSyncBatch).toHaveBeenCalledWith({ limit: 25 });
    await expect(response.json()).resolves.toEqual({
      success: true,
      claimed: 2,
      succeeded: 1,
      retried: 1,
      failed: 0,
      stale: 0,
    });
  });
});
