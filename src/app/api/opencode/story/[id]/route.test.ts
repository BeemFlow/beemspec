import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

const STORY_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('opencode story route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BEEMSPEC_OPENCODE_TOKEN;
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('returns story context with authenticated user', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: STORY_ID,
        release_id: 'release_1',
        title: 'Auth flow',
        requirements: 'Req',
        acceptance_criteria: 'AC',
        technical_guidelines: null,
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await GET(new Request(`http://localhost/api/opencode/story/${STORY_ID}`), {
      params: Promise.resolve({ id: STORY_ID }),
    });

    await expect(response.json()).resolves.toMatchObject({
      storyId: STORY_ID,
      releaseId: 'release_1',
      storyTitle: 'Auth flow',
    });
  });

  it('supports bearer token auth path', async () => {
    process.env.BEEMSPEC_OPENCODE_TOKEN = 'token_123';

    const single = vi.fn().mockResolvedValue({
      data: {
        id: STORY_ID,
        release_id: 'release_1',
        title: 'Auth flow',
        requirements: 'Req',
        acceptance_criteria: 'AC',
        technical_guidelines: null,
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    vi.mocked(createAdminClient).mockReturnValue({ from } as never);

    const response = await GET(
      new Request(`http://localhost/api/opencode/story/${STORY_ID}`, {
        headers: { authorization: 'Bearer token_123' },
      }),
      {
        params: Promise.resolve({ id: STORY_ID }),
      },
    );

    expect(requireAuth).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
