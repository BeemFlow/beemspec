import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadStoryWithStoryMap } from '@/build-runs/processor';
import { getLinearIssueSync } from '@/integrations/linear/issue-sync';
import { processStoryLinearSyncById } from '@/integrations/linear/sync-story-by-id';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { DELETE as deleteActivityById, PUT as putActivityById } from './activities/[id]/route';
import { POST as postActivities, PUT as putActivities } from './activities/route';
import { DELETE as deleteReleaseById, PUT as putReleaseById } from './releases/[id]/route';
import { POST as postReleases, PUT as putReleases } from './releases/route';
import { DELETE as deleteStoryById, PUT as putStoryById } from './stories/[id]/route';
import { POST as postStories, PUT as putStories } from './stories/route';
import { DELETE as deleteTaskById, PUT as putTaskById } from './tasks/[id]/route';
import { POST as postTasks, PUT as putTasks } from './tasks/route';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/build-runs/processor', () => ({
  loadStoryWithStoryMap: vi.fn(),
}));

vi.mock('@/integrations/linear/sync-story-by-id', () => ({
  processStoryLinearSyncById: vi.fn(),
}));

vi.mock('@/integrations/linear/issue-sync', () => ({
  getLinearIssueSync: vi.fn(),
}));

const VALID_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createInsertClient(returnData: unknown, options: { includeLinearSettings?: boolean } = {}) {
  const single = vi.fn().mockResolvedValue({ data: returnData, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });

  const taskSingle = vi.fn().mockResolvedValue({
    data: {
      activities: {
        story_maps: {
          team_id: 'team_db_1',
        },
      },
    },
    error: null,
  });
  const taskEq = vi.fn().mockReturnValue({ single: taskSingle });
  const taskSelect = vi.fn().mockReturnValue({ eq: taskEq });

  const settingsMaybeSingle = vi.fn().mockResolvedValue({
    data: {
      linear_team_id: 'team_1',
      linear_project_id: null,
      linear_state_id: null,
    },
    error: null,
  });
  const settingsEq = vi.fn().mockReturnValue({ maybeSingle: settingsMaybeSingle });
  const settingsSelect = vi.fn().mockReturnValue({ eq: settingsEq });

  const linkSingle = vi.fn().mockResolvedValue({
    data: {
      story_id: (returnData as { id?: string }).id ?? VALID_ID,
      linear_issue_id: 'lin_issue_1',
      linear_issue_identifier: 'ENG-101',
    },
    error: null,
  });
  const linkSelect = vi.fn().mockReturnValue({ single: linkSingle });
  const linkUpsert = vi.fn().mockReturnValue({ select: linkSelect });

  const from = vi.fn((table: string) => {
    if (options.includeLinearSettings && table === 'tasks') {
      return { select: taskSelect };
    }
    if (options.includeLinearSettings && table === 'integration_settings') {
      return { select: settingsSelect };
    }
    if (table === 'story_linear_links') {
      return { upsert: linkUpsert };
    }
    return { insert };
  });

  return {
    client: { from },
    from,
    insert,
  };
}

function createUpdateClient(returnData: unknown) {
  const single = vi.fn().mockResolvedValue({ data: returnData, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });

  return {
    client: { from },
    update,
  };
}

function createDeleteClient(returnData: unknown) {
  const single = vi.fn().mockResolvedValue({ data: returnData, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const remove = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ delete: remove });

  return {
    client: { from },
    remove,
  };
}

function createStoryUpdateWithLinkClient(
  storyData: Record<string, unknown>,
  existingLinearIssueId: string | null = null,
) {
  const storySingle = vi.fn().mockResolvedValue({ data: storyData, error: null });
  const storySelect = vi.fn().mockReturnValue({ single: storySingle });
  const storyEq = vi.fn().mockReturnValue({ select: storySelect });
  const update = vi.fn().mockReturnValue({ eq: storyEq });

  const teamSingle = vi.fn().mockResolvedValue({
    data: {
      tasks: {
        activities: {
          story_maps: {
            team_id: 'team_db_1',
          },
        },
      },
    },
    error: null,
  });
  const teamEq = vi.fn().mockReturnValue({ single: teamSingle });
  const teamSelect = vi.fn().mockReturnValue({ eq: teamEq });

  const settingsMaybeSingle = vi.fn().mockResolvedValue({
    data: {
      linear_team_id: 'team_1',
      linear_project_id: null,
      linear_state_id: null,
    },
    error: null,
  });
  const settingsEq = vi.fn().mockReturnValue({ maybeSingle: settingsMaybeSingle });
  const settingsSelect = vi.fn().mockReturnValue({ eq: settingsEq });

  const linkMaybeSingle = vi.fn().mockResolvedValue({
    data: existingLinearIssueId
      ? {
          story_id: storyData.id,
          linear_issue_id: existingLinearIssueId,
          linear_issue_identifier: 'ENG-101',
        }
      : null,
    error: null,
  });
  const linkEq = vi.fn().mockReturnValue({ maybeSingle: linkMaybeSingle });
  const linkSelect = vi.fn().mockReturnValue({ eq: linkEq });

  const linkSingle = vi.fn().mockResolvedValue({
    data: {
      story_id: storyData.id,
      linear_issue_id: existingLinearIssueId ?? 'lin_issue_2',
      linear_issue_identifier: 'ENG-102',
    },
    error: null,
  });
  const linkUpsertSelect = vi.fn().mockReturnValue({ single: linkSingle });
  const linkUpsert = vi.fn().mockReturnValue({ select: linkUpsertSelect });

  const from = vi.fn((table: string) => {
    if (table === 'stories') {
      return { update, select: teamSelect };
    }
    if (table === 'integration_settings') {
      return { select: settingsSelect };
    }
    if (table === 'story_linear_links') {
      return {
        select: linkSelect,
        upsert: linkUpsert,
      };
    }
    return {};
  });

  return {
    client: { from },
    update,
    linkUpsert,
  };
}

describe('story map API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({ success: true, user: { id: 'user' } } as never);
    vi.mocked(loadStoryWithStoryMap).mockResolvedValue({
      ok: true,
      data: { story: { id: VALID_ID }, storyMapId: 'map_1' },
    } as never);
    vi.mocked(processStoryLinearSyncById).mockResolvedValue({
      id: 'lin_issue_1',
      identifier: 'ENG-101',
      title: 'Issue title',
      description: null,
      stateId: null,
      updatedAt: '2026-02-16T00:00:00.000Z',
    });
    vi.mocked(getLinearIssueSync).mockReturnValue(null);
  });

  describe('reorder routes', () => {
    it('reorders activities through reorder_activities rpc', async () => {
      const rpc = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(createClient).mockResolvedValue({ rpc } as never);

      const response = await putActivities(jsonRequest({ story_map_id: VALID_ID, order: [VALID_ID] }));

      expect(rpc).toHaveBeenCalledWith('reorder_activities', {
        p_story_map_id: VALID_ID,
        p_order: [VALID_ID],
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ success: true });
    });

    it('reorders tasks through reorder_tasks rpc', async () => {
      const rpc = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(createClient).mockResolvedValue({ rpc } as never);

      const response = await putTasks(jsonRequest({ activity_id: VALID_ID, order: [VALID_ID] }));

      expect(rpc).toHaveBeenCalledWith('reorder_tasks', {
        p_activity_id: VALID_ID,
        p_order: [VALID_ID],
      });
      expect(response.status).toBe(200);
    });

    it('reorders releases through reorder_releases rpc', async () => {
      const rpc = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(createClient).mockResolvedValue({ rpc } as never);

      const response = await putReleases(jsonRequest({ story_map_id: VALID_ID, order: [VALID_ID] }));

      expect(rpc).toHaveBeenCalledWith('reorder_releases', {
        p_story_map_id: VALID_ID,
        p_order: [VALID_ID],
      });
      expect(response.status).toBe(200);
    });

    it('reorders stories through reorder_stories rpc', async () => {
      const rpc = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(createClient).mockResolvedValue({ rpc } as never);

      const response = await putStories(jsonRequest({ task_id: VALID_ID, release_id: null, order: [VALID_ID] }));

      expect(rpc).toHaveBeenCalledWith('reorder_stories', {
        p_task_id: VALID_ID,
        p_release_id: null,
        p_order: [VALID_ID],
      });
      expect(response.status).toBe(200);
    });

    it('returns 500 when reorder rpc fails', async () => {
      const rpc = vi.fn().mockResolvedValue({ error: { message: 'rpc failed' } });
      vi.mocked(createClient).mockResolvedValue({ rpc } as never);

      const [activitiesRes, tasksRes, releasesRes, storiesRes] = await Promise.all([
        putActivities(jsonRequest({ story_map_id: VALID_ID, order: [VALID_ID] })),
        putTasks(jsonRequest({ activity_id: VALID_ID, order: [VALID_ID] })),
        putReleases(jsonRequest({ story_map_id: VALID_ID, order: [VALID_ID] })),
        putStories(jsonRequest({ task_id: VALID_ID, release_id: null, order: [VALID_ID] })),
      ]);

      expect(activitiesRes.status).toBe(500);
      await expect(activitiesRes.json()).resolves.toEqual({ error: 'Failed to reorder activities' });

      expect(tasksRes.status).toBe(500);
      await expect(tasksRes.json()).resolves.toEqual({ error: 'Failed to reorder tasks' });

      expect(releasesRes.status).toBe(500);
      await expect(releasesRes.json()).resolves.toEqual({ error: 'Failed to reorder releases' });

      expect(storiesRes.status).toBe(500);
      await expect(storiesRes.json()).resolves.toEqual({ error: 'Failed to reorder stories' });
    });
  });

  describe('auth guard', () => {
    it('returns 401 when unauthenticated on collection route', async () => {
      vi.mocked(requireAuth).mockResolvedValue({
        success: false,
        response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
      } as never);

      const response = await putActivities(jsonRequest({ story_map_id: VALID_ID, order: [VALID_ID] }));

      expect(response.status).toBe(401);
      expect(createClient).not.toHaveBeenCalled();
    });

    it('returns 401 when unauthenticated on entity route', async () => {
      vi.mocked(requireAuth).mockResolvedValue({
        success: false,
        response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
      } as never);

      const response = await deleteStoryById(new Request('http://localhost/api/test'), {
        params: Promise.resolve({ id: VALID_ID }),
      });

      expect(response.status).toBe(401);
      expect(createClient).not.toHaveBeenCalled();
    });
  });

  describe('create routes', () => {
    it('creates activity with normalized nullable fields', async () => {
      const { client, insert } = createInsertClient({ id: VALID_ID, name: 'Signup' });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const response = await postActivities(jsonRequest({ story_map_id: VALID_ID, name: 'Signup' }));

      expect(insert).toHaveBeenCalledWith({ story_map_id: VALID_ID, name: 'Signup', description: null });
      await expect(response.json()).resolves.toMatchObject({ id: VALID_ID, name: 'Signup' });
    });

    it('creates task with normalized nullable fields', async () => {
      const { client, insert } = createInsertClient({ id: VALID_ID, name: 'Create account' });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const response = await postTasks(jsonRequest({ activity_id: VALID_ID, name: 'Create account' }));

      expect(insert).toHaveBeenCalledWith({ activity_id: VALID_ID, name: 'Create account', description: null });
      await expect(response.json()).resolves.toMatchObject({ id: VALID_ID, name: 'Create account' });
    });

    it('creates release with normalized nullable fields', async () => {
      const { client, insert } = createInsertClient({ id: VALID_ID, name: 'MVP' });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const response = await postReleases(jsonRequest({ story_map_id: VALID_ID, name: 'MVP' }));

      expect(insert).toHaveBeenCalledWith({ story_map_id: VALID_ID, name: 'MVP', description: null });
      await expect(response.json()).resolves.toMatchObject({ id: VALID_ID, name: 'MVP' });
    });

    it('creates story with normalized optional fields and default status', async () => {
      const { client, insert } = createInsertClient({ id: VALID_ID, title: 'Login' });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const response = await postStories(
        jsonRequest({
          task_id: VALID_ID,
          title: 'Login',
          requirements: 'As a user...',
          acceptance_criteria: '- [ ] Can log in',
        }),
      );

      expect(insert).toHaveBeenCalledWith({
        task_id: VALID_ID,
        release_id: null,
        title: 'Login',
        requirements: 'As a user...',
        acceptance_criteria: '- [ ] Can log in',
        figma_link: null,
        edge_cases: null,
        technical_guidelines: null,
        status: 'backlog',
      });
      await expect(response.json()).resolves.toMatchObject({ id: VALID_ID, title: 'Login' });
    });

    it('enqueues Linear sync for new story when configured', async () => {
      const { client } = createInsertClient({
        id: VALID_ID,
        title: 'Login',
        requirements: 'As a user...',
        acceptance_criteria: '- [ ] Can log in',
        edge_cases: null,
        technical_guidelines: null,
        figma_link: null,
        status: 'backlog',
      });
      vi.mocked(createClient).mockResolvedValue(client as never);
      const linearIssueSync = {
        getIssueById: vi.fn(),
        createIssue: vi.fn(),
        updateIssue: vi.fn(),
      };
      vi.mocked(getLinearIssueSync).mockReturnValue(linearIssueSync);

      const response = await postStories(
        jsonRequest({
          task_id: VALID_ID,
          title: 'Login',
          requirements: 'As a user...',
          acceptance_criteria: '- [ ] Can log in',
        }),
      );

      expect(processStoryLinearSyncById).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storyId: VALID_ID,
          linearIssueSync,
        }),
      );

      await expect(response.json()).resolves.toMatchObject({
        id: VALID_ID,
        title: 'Login',
        linear_sync: {
          status: 'synced',
          linear_issue_id: 'lin_issue_1',
          linear_issue_identifier: 'ENG-101',
        },
      });
    });
  });

  describe('update and delete routes', () => {
    it('updates activity by id', async () => {
      const { client, update } = createUpdateClient({ id: VALID_ID, name: 'Signup edited' });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const response = await putActivityById(jsonRequest({ name: 'Signup edited' }), {
        params: Promise.resolve({ id: VALID_ID }),
      });

      expect(update).toHaveBeenCalledWith({ name: 'Signup edited' });
      await expect(response.json()).resolves.toMatchObject({ id: VALID_ID, name: 'Signup edited' });
    });

    it('updates task by id', async () => {
      const { client, update } = createUpdateClient({ id: VALID_ID, name: 'Task edited' });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const response = await putTaskById(jsonRequest({ name: 'Task edited' }), {
        params: Promise.resolve({ id: VALID_ID }),
      });

      expect(update).toHaveBeenCalledWith({ name: 'Task edited' });
      await expect(response.json()).resolves.toMatchObject({ id: VALID_ID, name: 'Task edited' });
    });

    it('updates release by id', async () => {
      const { client, update } = createUpdateClient({ id: VALID_ID, name: 'Release edited' });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const response = await putReleaseById(jsonRequest({ name: 'Release edited' }), {
        params: Promise.resolve({ id: VALID_ID }),
      });

      expect(update).toHaveBeenCalledWith({ name: 'Release edited' });
      await expect(response.json()).resolves.toMatchObject({ id: VALID_ID, name: 'Release edited' });
    });

    it('updates story by id and stamps updated_at', async () => {
      const { client, update } = createUpdateClient({ id: VALID_ID, title: 'Story edited' });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const response = await putStoryById(jsonRequest({ title: 'Story edited' }), {
        params: Promise.resolve({ id: VALID_ID }),
      });

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Story edited',
          updated_at: expect.any(String),
        }),
      );
      await expect(response.json()).resolves.toMatchObject({ id: VALID_ID, title: 'Story edited' });
    });

    it('enqueues Linear sync for updated story when configured', async () => {
      const story = {
        id: VALID_ID,
        title: 'Story edited',
        requirements: 'As a user...',
        acceptance_criteria: '- [ ] Can update',
        edge_cases: null,
        technical_guidelines: null,
        figma_link: null,
        status: 'ready',
      };

      const { client } = createStoryUpdateWithLinkClient(story, 'lin_issue_1');
      vi.mocked(createClient).mockResolvedValue(client as never);

      const linearIssueSync = {
        getIssueById: vi.fn(),
        createIssue: vi.fn(),
        updateIssue: vi.fn(),
      };
      vi.mocked(getLinearIssueSync).mockReturnValue(linearIssueSync);

      const response = await putStoryById(jsonRequest({ title: 'Story edited', status: 'ready' }), {
        params: Promise.resolve({ id: VALID_ID }),
      });

      expect(processStoryLinearSyncById).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          storyId: VALID_ID,
          linearIssueSync,
        }),
      );

      await expect(response.json()).resolves.toMatchObject({
        id: VALID_ID,
        linear_sync: {
          status: 'synced',
          linear_issue_id: 'lin_issue_1',
          linear_issue_identifier: 'ENG-101',
        },
      });
    });

    it('deletes activity by id', async () => {
      const { client, remove } = createDeleteClient({ id: VALID_ID });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const response = await deleteActivityById(new Request('http://localhost/api/test'), {
        params: Promise.resolve({ id: VALID_ID }),
      });

      expect(remove).toHaveBeenCalled();
      await expect(response.json()).resolves.toMatchObject({ success: true });
    });

    it('deletes task by id', async () => {
      const { client, remove } = createDeleteClient({ id: VALID_ID });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const response = await deleteTaskById(new Request('http://localhost/api/test'), {
        params: Promise.resolve({ id: VALID_ID }),
      });

      expect(remove).toHaveBeenCalled();
      await expect(response.json()).resolves.toMatchObject({ success: true });
    });

    it('deletes release by id', async () => {
      const { client, remove } = createDeleteClient({ id: VALID_ID });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const response = await deleteReleaseById(new Request('http://localhost/api/test'), {
        params: Promise.resolve({ id: VALID_ID }),
      });

      expect(remove).toHaveBeenCalled();
      await expect(response.json()).resolves.toMatchObject({ success: true });
    });

    it('deletes story by id', async () => {
      const { client, remove } = createDeleteClient({ id: VALID_ID });
      vi.mocked(createClient).mockResolvedValue(client as never);

      const response = await deleteStoryById(new Request('http://localhost/api/test'), {
        params: Promise.resolve({ id: VALID_ID }),
      });

      expect(remove).toHaveBeenCalled();
      await expect(response.json()).resolves.toMatchObject({ success: true });
    });
  });
});
