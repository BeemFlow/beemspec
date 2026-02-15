import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { GET } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

const RUN_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('release run detail route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
  });

  it('returns run detail including session and retry metadata', async () => {
    const runSingle = vi.fn().mockResolvedValue({
      data: { id: RUN_ID, status: 'failed', total_items: 2, completed_items: 1, failed_items: 1 },
      error: null,
    });
    const runEq = vi.fn().mockReturnValue({ single: runSingle });
    const runSelect = vi.fn().mockReturnValue({ eq: runEq });

    const itemsOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'item_1',
          story_id: 'story_1',
          linear_issue_id: 'lin_1',
          opencode_session_id: 'session_1',
          opencode_session_url: 'https://opencode.ai/sessions/session_1',
          status: 'failed',
          retry_count: 2,
          last_retry_at: '2026-02-14T11:10:00.000Z',
          error: 'sync failed',
        },
      ],
      error: null,
    });
    const itemsEq = vi.fn().mockReturnValue({ order: itemsOrder });
    const itemsSelect = vi.fn().mockReturnValue({ eq: itemsEq });

    const linksIn = vi.fn().mockResolvedValue({
      data: [{ story_id: 'story_1', linear_issue_identifier: 'ENG-1' }],
      error: null,
    });
    const linksSelect = vi.fn().mockReturnValue({ in: linksIn });

    const from = vi.fn((table: string) => {
      if (table === 'release_runs') return { select: runSelect };
      if (table === 'release_run_items') return { select: itemsSelect };
      if (table === 'story_linear_links') return { select: linksSelect };
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await GET(new Request('http://localhost/api/test'), { params: Promise.resolve({ id: RUN_ID }) });

    await expect(response.json()).resolves.toMatchObject({
      id: RUN_ID,
      status: 'failed',
      items: [
        expect.objectContaining({
          opencode_session_id: 'session_1',
          opencode_session_url: 'https://opencode.ai/sessions/session_1',
          linear_issue_identifier: 'ENG-1',
          retry_count: 2,
          last_retry_at: '2026-02-14T11:10:00.000Z',
        }),
      ],
    });
  });

  it('returns 404 when run does not exist', async () => {
    const runSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'not found' },
    });
    const runEq = vi.fn().mockReturnValue({ single: runSingle });
    const runSelect = vi.fn().mockReturnValue({ eq: runEq });
    const from = vi.fn((table: string) => {
      if (table === 'release_runs') return { select: runSelect };
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await GET(new Request('http://localhost/api/test'), { params: Promise.resolve({ id: RUN_ID }) });

    expect(response.status).toBe(404);
  });
});
