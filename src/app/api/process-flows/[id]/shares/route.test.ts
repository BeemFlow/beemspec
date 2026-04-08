import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

const FLOW_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('process flow shares route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SHARE_LINK_SECRET = 'test-share-link-secret';
    vi.mocked(requireAuth).mockResolvedValue({
      success: true,
      user: { id: 'user-1', email: 'person@example.com' },
    } as never);
  });

  it('returns a signed embed url for an accessible flow', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: FLOW_ID }, error: null });
    const eq = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await POST(
      new Request(`http://internal-service/api/process-flows/${FLOW_ID}/shares`, {
        method: 'POST',
        headers: {
          host: 'internal-service',
          'x-forwarded-host': 'app.example.com',
          'x-forwarded-proto': 'https',
        },
      }),
      { params: Promise.resolve({ id: FLOW_ID }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.url).toMatch(/^https:\/\/app\.example\.com\/embed\/process-flows\//);
  });

  it('returns 404 when the flow is not accessible', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    const eq = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await POST(
      new Request(`http://localhost/api/process-flows/${FLOW_ID}/shares`, { method: 'POST' }),
      {
        params: Promise.resolve({ id: FLOW_ID }),
      },
    );

    expect(response.status).toBe(404);
  });
});
