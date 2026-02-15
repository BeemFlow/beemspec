import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

const RELEASE_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('release story states route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('returns latest run info per story', async () => {
    const storiesOrder = vi.fn().mockResolvedValue({
      data: [{ id: 'story_1', title: 'Story 1', status: 'ready' }],
      error: null,
    });
    const storiesEq = vi.fn().mockReturnValue({ order: storiesOrder });
    const storiesSelect = vi.fn().mockReturnValue({ eq: storiesEq });

    const itemsOrder = vi.fn().mockResolvedValue({
      data: [
        {
          story_id: 'story_1',
          status: 'failed',
          error: 'sync failed',
          linear_issue_id: 'lin_1',
          opencode_session_id: 'session_1',
          opencode_session_url: 'https://opencode.ai/sessions/session_1',
          retry_count: 1,
          last_retry_at: null,
          created_at: '2026-02-15T12:00:00.000Z',
          run: { id: 'run_1', status: 'failed' },
        },
      ],
      error: null,
    });
    const itemsEq = vi.fn().mockReturnValue({ order: itemsOrder });
    const itemsSelect = vi.fn().mockReturnValue({ eq: itemsEq });

    const from = vi.fn((table: string) => {
      if (table === 'stories') return { select: storiesSelect };
      if (table === 'build_run_items') return { select: itemsSelect };
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await GET(new Request('http://localhost/api/test'), {
      params: Promise.resolve({ id: RELEASE_ID }),
    });
    await expect(response.json()).resolves.toMatchObject({
      story_states: [
        expect.objectContaining({
          story_id: 'story_1',
          latest_run: expect.objectContaining({ item_status: 'failed', run_status: 'failed' }),
        }),
      ],
    });
  });
});
