import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isLinearSyncAvailableForStoryMap, resolveLinearSyncContextForStory } from '@/integrations/linear/auth';
import { processStoryLinearSyncById } from '@/integrations/linear/sync-story-by-id';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { loadStoryWithStoryMap } from '@/storymap/story-context';
import { DELETE as deleteActivityById, PUT as putActivityById } from '../activities/[id]/route';
import { POST as postActivities, PUT as putActivities } from '../activities/route';
import { DELETE as deleteReleaseById, PUT as putReleaseById } from '../releases/[id]/route';
import { POST as postReleases, PUT as putReleases } from '../releases/route';
import { PUT as moveStoryById } from '../stories/[id]/move/route';
import { DELETE as deleteStoryById, PUT as putStoryById } from '../stories/[id]/route';
import { POST as postStories, PUT as putStories } from '../stories/route';
import { PUT as moveTaskById } from '../tasks/[id]/move/route';
import { DELETE as deleteTaskById, PUT as putTaskById } from '../tasks/[id]/route';
import { POST as postTasks, PUT as putTasks } from '../tasks/route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/storymap/story-context', () => ({ loadStoryWithStoryMap: vi.fn() }));
vi.mock('@/integrations/linear/sync-story-by-id', () => ({ processStoryLinearSyncById: vi.fn() }));
vi.mock('@/integrations/linear/auth', () => ({
  isLinearSyncAvailableForStoryMap: vi.fn(),
  resolveLinearSyncContextForStory: vi.fn(),
}));

const VALID_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createInsertClient(returnData: unknown) {
  const single = vi.fn().mockResolvedValue({ data: returnData, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn((table: string) => {
    if (table === 'story_linear_links') {
      const linkSingle = vi
        .fn()
        .mockResolvedValue({ data: { story_id: VALID_ID, linear_issue_id: 'lin_1' }, error: null });
      return { upsert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: linkSingle }) }) };
    }
    return { insert };
  });
  return { client: { from }, insert };
}

function createUpdateClient(returnData: unknown) {
  const single = vi.fn().mockResolvedValue({ data: returnData, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { client: { from }, update };
}

function createDeleteClient(returnData: unknown, linkedLinearIssueId?: string | null) {
  const single = vi.fn().mockResolvedValue({ data: returnData, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const remove = vi.fn().mockReturnValue({ eq });
  const linkMaybeSingle = vi.fn().mockResolvedValue({
    data: linkedLinearIssueId ? { story_id: VALID_ID, linear_issue_id: linkedLinearIssueId } : null,
    error: null,
  });
  const from = vi.fn((table: string) => {
    if (table === 'story_linear_links') {
      return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: linkMaybeSingle }) }) };
    }
    return { delete: remove };
  });
  return { client: { from }, remove };
}

describe('story map domain routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user' } } as never);
    vi.mocked(loadStoryWithStoryMap).mockResolvedValue({
      ok: true,
      data: { story: { id: VALID_ID }, storyMapId: 'map_1' },
    } as never);
    vi.mocked(isLinearSyncAvailableForStoryMap).mockResolvedValue(false);
    vi.mocked(processStoryLinearSyncById).mockResolvedValue({ id: 'lin_1', identifier: 'ENG-1' } as never);
    vi.mocked(resolveLinearSyncContextForStory).mockResolvedValue({
      teamId: 'team_1',
      targetConfigured: true,
      target: { teamId: 'linear_team_1' },
      linearIssueSync: null,
    });
  });

  it('reorders collections through rpc', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
    await putActivities(jsonRequest({ story_map_id: VALID_ID, order: [VALID_ID] }));
    await putTasks(jsonRequest({ activity_id: VALID_ID, order: [VALID_ID] }));
    await putReleases(jsonRequest({ story_map_id: VALID_ID, order: [VALID_ID] }));
    const response = await putStories(jsonRequest({ task_id: VALID_ID, release_id: null, order: [VALID_ID] }));
    expect(response.status).toBe(200);
  });

  it('moves task and story atomically via rpc', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
    const [taskRes, storyRes] = await Promise.all([
      moveTaskById(jsonRequest({ target_activity_id: VALID_ID, target_order: [VALID_ID] }), {
        params: Promise.resolve({ id: VALID_ID }),
      }),
      moveStoryById(jsonRequest({ target_task_id: VALID_ID, target_release_id: null, target_order: [VALID_ID] }), {
        params: Promise.resolve({ id: VALID_ID }),
      }),
    ]);
    expect(taskRes.status).toBe(200);
    expect(storyRes.status).toBe(200);
  });

  it('creates and updates entities', async () => {
    const { client: insertClient } = createInsertClient({ id: VALID_ID, title: 'Login', name: 'N' });
    vi.mocked(createClient).mockResolvedValue(insertClient as never);
    await postActivities(jsonRequest({ story_map_id: VALID_ID, name: 'Signup' }));
    await postTasks(jsonRequest({ activity_id: VALID_ID, name: 'Task' }));
    await postReleases(jsonRequest({ story_map_id: VALID_ID, name: 'R1' }));
    await postStories(
      jsonRequest({
        task_id: VALID_ID,
        title: 'Login',
        content: { user_story: 'As a user...', acceptance_criteria: '- [ ] Can log in' },
      }),
    );

    const { client: updateClient } = createUpdateClient({ id: VALID_ID, title: 'Edited', name: 'Edited' });
    vi.mocked(createClient).mockResolvedValue(updateClient as never);
    await putActivityById(jsonRequest({ name: 'Edited' }), { params: Promise.resolve({ id: VALID_ID }) });
    await putTaskById(jsonRequest({ name: 'Edited' }), { params: Promise.resolve({ id: VALID_ID }) });
    await putReleaseById(jsonRequest({ name: 'Edited' }), { params: Promise.resolve({ id: VALID_ID }) });
    const response = await putStoryById(jsonRequest({ title: 'Edited' }), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(response.status).toBe(200);
  });

  it('syncs linear for story create when configured', async () => {
    const { client } = createInsertClient({
      id: VALID_ID,
      title: 'Login',
      content: { _version: 1, user_story: 'r', acceptance_criteria: 'a' },
      status: 'backlog',
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(isLinearSyncAvailableForStoryMap).mockResolvedValue(true);
    await postStories(
      jsonRequest({
        task_id: VALID_ID,
        title: 'Login',
        content: { user_story: 'As a user...', acceptance_criteria: '- [ ] Can log in' },
      }),
    );
    expect(processStoryLinearSyncById).toHaveBeenCalled();
  });

  it('deletes entities and attempts linked linear deletion first', async () => {
    const { client, remove } = createDeleteClient({ id: VALID_ID }, 'lin_issue_1');
    vi.mocked(createClient).mockResolvedValue(client as never);
    const deleteIssue = vi.fn().mockResolvedValue(undefined);
    vi.mocked(resolveLinearSyncContextForStory).mockResolvedValue({
      teamId: 'team_1',
      targetConfigured: true,
      target: { teamId: 'linear_team_1' },
      linearIssueSync: { getIssueById: vi.fn(), createIssue: vi.fn(), updateIssue: vi.fn(), deleteIssue },
    });

    await deleteActivityById(new Request('http://localhost/api/test'), { params: Promise.resolve({ id: VALID_ID }) });
    await deleteTaskById(new Request('http://localhost/api/test'), { params: Promise.resolve({ id: VALID_ID }) });
    await deleteReleaseById(new Request('http://localhost/api/test'), { params: Promise.resolve({ id: VALID_ID }) });
    const response = await deleteStoryById(new Request('http://localhost/api/test'), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(deleteIssue).toHaveBeenCalledWith('lin_issue_1');
    expect(remove).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
