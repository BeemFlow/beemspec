import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processBuildRunById } from '@/build-runs/processor';
import { createOpenCodeSessions } from '@/integrations/opencode/session';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/build-runs/processor', () => ({ processBuildRunById: vi.fn() }));
vi.mock('@/integrations/opencode/session', () => ({ createOpenCodeSessions: vi.fn() }));

const RUN_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('build run retry route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
    vi.mocked(createOpenCodeSessions).mockReturnValue({
      createSession: vi.fn(),
      getSessionById: vi.fn(),
      appendStoryAssignment: vi.fn(),
    });
  });

  it('retries failed items by processing inline', async () => {
    const runSingle = vi.fn().mockResolvedValue({
      data: { id: RUN_ID, release_id: 'release_1', story_map_id: 'story_map_1', total_items: 2 },
      error: null,
    });
    const runEq = vi.fn().mockReturnValue({ single: runSingle });

    const failedItemsEqStatus = vi.fn().mockResolvedValue({ data: [{ story_id: 'story_1' }], error: null });
    const failedItemsEqRun = vi.fn().mockReturnValue({ eq: failedItemsEqStatus });
    const failedItemsSelect = vi.fn().mockReturnValue({ eq: failedItemsEqRun });

    const from = vi.fn((table: string) => {
      if (table === 'build_runs') return { select: () => ({ eq: runEq }) };
      if (table === 'build_run_items') return { select: failedItemsSelect };
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);
    vi.mocked(processBuildRunById).mockResolvedValue({
      status: 'completed',
      totalItems: 1,
      completedItems: 1,
      failedItems: 0,
    });

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RUN_ID }),
    });

    expect(response.status).toBe(200);
    expect(processBuildRunById).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ runId: RUN_ID, storyIds: ['story_1'] }),
    );
    await expect(response.json()).resolves.toMatchObject({
      run_id: RUN_ID,
      retried_items: 1,
      status: 'completed',
    });
  });

  it('returns 500 when processing fails', async () => {
    const runSingle = vi.fn().mockResolvedValue({
      data: { id: RUN_ID, release_id: 'release_1', story_map_id: 'story_map_1', total_items: 2 },
      error: null,
    });
    const runEq = vi.fn().mockReturnValue({ single: runSingle });

    const failedItemsEqStatus = vi.fn().mockResolvedValue({ data: [{ story_id: 'story_1' }], error: null });
    const failedItemsEqRun = vi.fn().mockReturnValue({ eq: failedItemsEqStatus });
    const failedItemsSelect = vi.fn().mockReturnValue({ eq: failedItemsEqRun });

    const from = vi.fn((table: string) => {
      if (table === 'build_runs') return { select: () => ({ eq: runEq }) };
      if (table === 'build_run_items') return { select: failedItemsSelect };
      return {};
    });

    vi.mocked(createClient).mockResolvedValue({ from } as never);
    vi.mocked(processBuildRunById).mockRejectedValue(new Error('processing failed'));

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: RUN_ID }),
    });

    expect(response.status).toBe(500);
  });
});
