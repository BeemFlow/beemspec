import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DbErrorCode } from '@/lib/errors';
import {
  createStory,
  deleteStory,
  getReleaseMcpContext,
  getStory,
  getStoryMapGraph,
  getStoryMapMcpContext,
  listPersonas,
  listStoryMaps,
  moveStory,
  moveTask,
  reorderActivities,
  reorderReleases,
  reorderStories,
  reorderTasks,
  updateStory,
} from './service';

function createInsertStoriesClient(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn((table: string) => {
    if (table === 'stories') return { insert };
    throw new Error(`Unexpected table: ${table}`);
  });
  return { supabase: { from } as never, insert };
}

function createDeleteStoriesClient() {
  const single = vi.fn().mockResolvedValue({ data: { id: 'story-1' }, error: null });
  const rpc = vi.fn().mockReturnValue({ single });
  return { supabase: { rpc } as never, rpc };
}

function createUpdateStoriesClient(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result);
  const select = vi.fn().mockReturnValue({ single });
  const eq = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn((table: string) => {
    if (table === 'stories') return { update };
    throw new Error(`Unexpected table: ${table}`);
  });
  return { supabase: { from } as never, update };
}

describe('storymap service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a story without waiting on an external integration', async () => {
    const { supabase, insert } = createInsertStoriesClient({
      data: {
        id: 'story-1',
        task_id: 'task-1',
        release_id: null,
        title: 'Approve invoice',
        content: {
          _version: 1,
          user_story: 'As a manager, I can approve an invoice for payment.',
          acceptance_criteria: '- [ ] Approval updates the invoice status',
        },
        status: 'backlog',
      },
      error: null,
    });
    const result = await createStory(supabase, {
      task_id: 'task-1',
      title: 'Approve invoice',
      content: {
        _version: 1,
        user_story: 'As a manager, I can approve an invoice for payment.',
        acceptance_criteria: '- [ ] Approval updates the invoice status',
      },
      status: 'backlog',
    });

    expect(insert).toHaveBeenCalledWith({
      task_id: 'task-1',
      release_id: null,
      title: 'Approve invoice',
      content: {
        _version: 1,
        user_story: 'As a manager, I can approve an invoice for payment.',
        acceptance_criteria: '- [ ] Approval updates the invoice status',
      },
      status: 'backlog',
    });
    expect(result).toEqual({
      data: {
        id: 'story-1',
        task_id: 'task-1',
        release_id: null,
        title: 'Approve invoice',
        content: {
          _version: 1,
          user_story: 'As a manager, I can approve an invoice for payment.',
          acceptance_criteria: '- [ ] Approval updates the invoice status',
        },
        status: 'backlog',
      },
      error: null,
    });
  });

  it('updates a story without waiting on an external integration', async () => {
    const { supabase, update } = createUpdateStoriesClient({
      data: {
        id: 'story-1',
        task_id: 'task-1',
        release_id: null,
        title: 'Approve invoice online',
        content: {
          _version: 1,
          user_story: 'As a manager, I can approve an invoice online.',
          acceptance_criteria: '- [ ] Approval is saved',
        },
        status: 'in_review',
      },
      error: null,
    });
    const result = await updateStory(supabase, 'story-1', {
      title: 'Approve invoice online',
      status: 'in_review',
    });

    expect(update).toHaveBeenCalledWith({ title: 'Approve invoice online', status: 'in_review' });
    expect(result).toEqual({
      data: {
        id: 'story-1',
        task_id: 'task-1',
        release_id: null,
        title: 'Approve invoice online',
        content: {
          _version: 1,
          user_story: 'As a manager, I can approve an invoice online.',
          acceptance_criteria: '- [ ] Approval is saved',
        },
        status: 'in_review',
      },
      error: null,
    });
  });

  it('deletes through the atomic durable-sync RPC', async () => {
    const { supabase, rpc } = createDeleteStoriesClient();

    const result = await deleteStory(supabase, 'story-1');

    expect(rpc).toHaveBeenCalledWith('delete_story_with_linear_sync', { p_story_id: 'story-1' });
    expect(result).toEqual({ data: { id: 'story-1' }, error: null });
  });

  it('short-circuits release MCP context lookup when the release is missing', async () => {
    const releaseSingle = vi.fn().mockResolvedValue({ data: null, error: { code: DbErrorCode.NOT_FOUND } });
    const releaseEq = vi.fn().mockReturnValue({ single: releaseSingle });
    const releaseSelect = vi.fn().mockReturnValue({ eq: releaseEq });
    const from = vi.fn((table: string) => {
      if (table === 'releases') return { select: releaseSelect };
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await getReleaseMcpContext({ from } as never, 'release-404');

    expect(result.releaseResult).toEqual({ data: null, error: { code: DbErrorCode.NOT_FOUND } });
    expect(result.mapResult).toEqual({ data: null, error: { code: DbErrorCode.NOT_FOUND } });
    expect(result.activitiesResult).toEqual({ data: null, error: { code: DbErrorCode.NOT_FOUND } });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('loads a story map graph without querying personas by default', async () => {
    const storyMapSingle = vi.fn().mockResolvedValue({ data: { id: 'map-1', name: 'Map' }, error: null });
    const storyMapEq = vi.fn().mockReturnValue({ single: storyMapSingle });
    const storyMapSelect = vi.fn().mockReturnValue({ eq: storyMapEq });

    const activitiesOrder3 = vi.fn().mockResolvedValue({ data: [{ id: 'activity-1', tasks: [] }], error: null });
    const activitiesOrder2 = vi.fn().mockReturnValue({ order: activitiesOrder3 });
    const activitiesOrder1 = vi.fn().mockReturnValue({ order: activitiesOrder2 });
    const activitiesEq = vi.fn().mockReturnValue({ order: activitiesOrder1 });
    const activitiesSelect = vi.fn().mockReturnValue({ eq: activitiesEq });

    const releasesOrder = vi.fn().mockResolvedValue({ data: [{ id: 'release-1' }], error: null });
    const releasesEq = vi.fn().mockReturnValue({ order: releasesOrder });
    const releasesSelect = vi.fn().mockReturnValue({ eq: releasesEq });

    const from = vi.fn((table: string) => {
      if (table === 'story_maps') return { select: storyMapSelect };
      if (table === 'activities') return { select: activitiesSelect };
      if (table === 'releases') return { select: releasesSelect };
      if (table === 'personas') throw new Error('Personas should not be queried');
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await getStoryMapGraph({ from } as never, 'map-1');

    expect(result.mapResult.data).toEqual({ id: 'map-1', name: 'Map' });
    expect(result.activitiesResult.data).toEqual([{ id: 'activity-1', tasks: [] }]);
    expect(result.releasesResult.data).toEqual([{ id: 'release-1' }]);
    expect(result.personasResult).toEqual({ data: [], error: null });
  });

  it('loads MCP story map context including personas when requested', async () => {
    const mapSingle = vi.fn().mockResolvedValue({ data: { id: 'map-1', name: 'Map A' }, error: null });
    const mapEq = vi.fn().mockReturnValue({ single: mapSingle });
    const mapSelect = vi.fn().mockReturnValue({ eq: mapEq });

    const activitiesOrder3 = vi.fn().mockResolvedValue({ data: [{ id: 'activity-1', tasks: [] }], error: null });
    const activitiesOrder2 = vi.fn().mockReturnValue({ order: activitiesOrder3 });
    const activitiesOrder1 = vi.fn().mockReturnValue({ order: activitiesOrder2 });
    const activitiesEq = vi.fn().mockReturnValue({ order: activitiesOrder1 });
    const activitiesSelect = vi.fn().mockReturnValue({ eq: activitiesEq });

    const releasesOrder = vi.fn().mockResolvedValue({ data: [{ id: 'release-1' }], error: null });
    const releasesEq = vi.fn().mockReturnValue({ order: releasesOrder });
    const releasesSelect = vi.fn().mockReturnValue({ eq: releasesEq });

    const personasOrder = vi.fn().mockResolvedValue({ data: [{ id: 'persona-1', name: 'Manager' }], error: null });
    const personasEq = vi.fn().mockReturnValue({ order: personasOrder });
    const personasSelect = vi.fn().mockReturnValue({ eq: personasEq });

    const from = vi.fn((table: string) => {
      if (table === 'story_maps') return { select: mapSelect };
      if (table === 'activities') return { select: activitiesSelect };
      if (table === 'releases') return { select: releasesSelect };
      if (table === 'personas') return { select: personasSelect };
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await getStoryMapMcpContext({ from } as never, 'map-1', { includePersonas: true });

    expect(result.mapResult.data).toEqual({ id: 'map-1', name: 'Map A' });
    expect(result.personasResult.data).toEqual([{ id: 'persona-1', name: 'Manager' }]);
  });

  it('lists story maps, personas, and can fetch a story by id', async () => {
    const storyMapsOrder = vi.fn().mockResolvedValue({ data: [{ id: 'map-1' }], error: null });
    const storyMapsEq = vi.fn().mockReturnValue({ order: storyMapsOrder });
    const storyMapsSelect = vi.fn().mockReturnValue({ eq: storyMapsEq });

    const personasOrder = vi.fn().mockResolvedValue({ data: [{ id: 'persona-1' }], error: null });
    const personasEq = vi.fn().mockReturnValue({ order: personasOrder });
    const personasSelect = vi.fn().mockReturnValue({ eq: personasEq });

    const storySingle = vi.fn().mockResolvedValue({ data: { id: 'story-1' }, error: null });
    const storyEq = vi.fn().mockReturnValue({ single: storySingle });
    const storySelect = vi.fn().mockReturnValue({ eq: storyEq });

    const from = vi.fn((table: string) => {
      if (table === 'story_maps') return { select: storyMapsSelect };
      if (table === 'personas') return { select: personasSelect };
      if (table === 'stories') return { select: storySelect };
      throw new Error(`Unexpected table: ${table}`);
    });

    await listStoryMaps({ from } as never, 'team-1');
    await listPersonas({ from } as never, 'map-1');
    await getStory({ from } as never, 'story-1');

    expect(storyMapsEq).toHaveBeenCalledWith('team_id', 'team-1');
    expect(personasEq).toHaveBeenCalledWith('story_map_id', 'map-1');
    expect(storyEq).toHaveBeenCalledWith('id', 'story-1');
  });

  it('calls the correct reorder and move RPCs for story map operations', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { rpc } as never;

    await reorderActivities(supabase, { story_map_id: 'map-1', order: ['activity-1', 'activity-2'] });
    await reorderTasks(supabase, { activity_id: 'activity-1', order: ['task-1'] });
    await reorderReleases(supabase, { story_map_id: 'map-1', order: ['release-1'] });
    await reorderStories(supabase, { task_id: 'task-1', release_id: 'release-1', order: ['story-1'] });
    await moveTask(supabase, 'task-1', {
      target_activity_id: 'activity-2',
      target_order: ['00000000-0000-4000-8000-000000000001'],
    });
    await moveStory(supabase, 'story-1', {
      target_task_id: 'task-2',
      target_release_id: 'release-2',
      target_order: ['00000000-0000-4000-8000-000000000002'],
    });

    expect(rpc).toHaveBeenNthCalledWith(1, 'reorder_activities', {
      p_story_map_id: 'map-1',
      p_order: ['activity-1', 'activity-2'],
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'reorder_tasks', {
      p_activity_id: 'activity-1',
      p_order: ['task-1'],
    });
    expect(rpc).toHaveBeenNthCalledWith(3, 'reorder_releases', {
      p_story_map_id: 'map-1',
      p_order: ['release-1'],
    });
    expect(rpc).toHaveBeenNthCalledWith(4, 'reorder_stories', {
      p_task_id: 'task-1',
      p_release_id: 'release-1',
      p_order: ['story-1'],
    });
    expect(rpc).toHaveBeenNthCalledWith(5, 'move_task_and_reorder', {
      p_task_id: 'task-1',
      p_target_activity_id: 'activity-2',
      p_target_order: ['00000000-0000-4000-8000-000000000001'],
    });
    expect(rpc).toHaveBeenNthCalledWith(6, 'move_story_and_reorder', {
      p_story_id: 'story-1',
      p_target_task_id: 'task-2',
      p_target_release_id: 'release-2',
      p_target_order: ['00000000-0000-4000-8000-000000000002'],
    });
  });
});
