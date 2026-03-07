import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLinearIssueSync } from '@/integrations/linear/helpers';
import { processStoryLinearSyncById } from '@/integrations/linear/sync-story-by-id';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { loadStoryWithStoryMap } from '@/storymap/story-context';
import { POST } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/storymap/story-context', () => ({
  loadStoryWithStoryMap: vi.fn(),
}));
vi.mock('@/integrations/linear/helpers', () => ({ getLinearIssueSync: vi.fn() }));
vi.mock('@/integrations/linear/sync-story-by-id', () => ({ processStoryLinearSyncById: vi.fn() }));

const STORY_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

describe('story manual linear sync route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user_1' } } as never);
    vi.mocked(getLinearIssueSync).mockReturnValue(null);
  });

  it('syncs story to linear immediately', async () => {
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn() } as never);
    vi.mocked(loadStoryWithStoryMap).mockResolvedValue({
      ok: true,
      data: { story: { id: STORY_ID }, storyMapId: 'story_map_1' },
    } as never);

    const linearIssueSync = { getIssueById: vi.fn(), createIssue: vi.fn(), updateIssue: vi.fn(), deleteIssue: vi.fn() };
    vi.mocked(getLinearIssueSync).mockReturnValue(linearIssueSync);
    vi.mocked(processStoryLinearSyncById).mockResolvedValue({
      id: 'lin_issue_1',
      identifier: 'ENG-101',
      title: 'Issue',
      description: null,
      stateId: null,
      updatedAt: '2026-02-16T00:00:00.000Z',
    } as never);

    const response = await POST(new Request('http://localhost/api/test', { method: 'POST' }), {
      params: Promise.resolve({ id: STORY_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      story_id: STORY_ID,
      status: 'synced',
      linear_issue_id: 'lin_issue_1',
      linear_issue_identifier: 'ENG-101',
    });
  });
});
