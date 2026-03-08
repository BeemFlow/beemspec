import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as storymapService from '@/storymap/service';

import { handleMcpRequest } from './server';

function rpcRequest(body: unknown): Request {
  return new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  });
}

describe('mcp server', () => {
  const supabase = { from: vi.fn(), rpc: vi.fn() } as never;
  const user = { id: 'user-1', email: 'user@example.com' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists major story map management tools', async () => {
    const initializeResponse = await handleMcpRequest(
      rpcRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'vitest', version: '1.0.0' },
        },
      }),
      supabase,
      user,
    );

    expect(initializeResponse.status).toBe(200);

    const initializedResponse = await handleMcpRequest(
      rpcRequest({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
      supabase,
      user,
    );

    expect(initializedResponse.status).toBe(202);

    const listResponse = await handleMcpRequest(
      rpcRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
      supabase,
      user,
    );

    expect(listResponse.status).toBe(200);

    const payload = (await listResponse.json()) as {
      result: {
        tools: Array<{ name: string }>;
      };
    };
    const toolNames = new Set(payload.result.tools.map((tool) => tool.name));

    expect(toolNames.has('storymap_workflow_guide')).toBe(true);
    expect(toolNames.has('storymap_list')).toBe(true);
    expect(toolNames.has('storymap_get')).toBe(true);
    expect(toolNames.has('storymap_delete')).toBe(false);
    expect(toolNames.has('activity_create')).toBe(true);
    expect(toolNames.has('task_create')).toBe(true);
    expect(toolNames.has('release_create')).toBe(true);
    expect(toolNames.has('story_create')).toBe(true);
    expect(toolNames.has('persona_create')).toBe(true);
    expect(toolNames.has('story_context_get')).toBe(true);
    expect(toolNames.has('story_mark_blocked')).toBe(false);
    expect(toolNames.has('story')).toBe(false);
    expect(toolNames.has('blocked')).toBe(false);
  });

  it('returns workflow guide content for planning sequence', async () => {
    const response = await handleMcpRequest(
      rpcRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'storymap_workflow_guide',
          arguments: {},
        },
      }),
      supabase,
      user,
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      result: {
        structuredContent: {
          ok: boolean;
          data: {
            recommended_sequence: string[];
          };
        };
      };
    };

    expect(payload.result.structuredContent.ok).toBe(true);
    expect(payload.result.structuredContent.data.recommended_sequence[0]).toContain('storymap_list');
    expect(payload.result.structuredContent.data.recommended_sequence[1]).toContain('storymap_get');
  });

  it('calls storymap_list through shared service path', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4', name: 'Core Product' }],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const fakeSupabase = { from, rpc: vi.fn() } as never;

    const response = await handleMcpRequest(
      rpcRequest({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'storymap_list',
          arguments: {
            team_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
          },
        },
      }),
      fakeSupabase,
      user,
    );

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith('story_maps');
    expect(select).toHaveBeenCalledWith('*');
    expect(eq).toHaveBeenCalledWith('team_id', 'd7f34189-5d27-4dc0-b2c5-23d11796add4');
    expect(order).toHaveBeenCalledWith('updated_at', { ascending: false });

    const payload = (await response.json()) as {
      result: {
        structuredContent: {
          ok: boolean;
          data: Array<{ id: string }>;
        };
      };
    };
    expect(payload.result.structuredContent.ok).toBe(true);
    expect(payload.result.structuredContent.data).toHaveLength(1);
  });

  it('calls story_create and returns structured story payload', async () => {
    const fakeSupabase = { from: vi.fn(), rpc: vi.fn() } as never;

    const createStorySpy = vi.spyOn(storymapService, 'createStory').mockResolvedValue({
      data: {
        id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
        title: 'Implement sign-in',
        status: 'backlog',
      },
      error: null,
    } as never);

    const response = await handleMcpRequest(
      rpcRequest({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'story_create',
          arguments: {
            task_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
            title: 'Implement sign-in',
            content: {
              requirements: 'User can sign in',
              acceptance_criteria: '- [ ] Sign in succeeds',
            },
            status: 'backlog',
          },
        },
      }),
      fakeSupabase,
      user,
    );

    expect(response.status).toBe(200);
    expect(createStorySpy).toHaveBeenCalledWith(
      fakeSupabase,
      expect.objectContaining({
        title: 'Implement sign-in',
      }),
    );

    const payload = (await response.json()) as {
      result: {
        structuredContent: {
          ok: boolean;
          data: { id: string; title: string };
        };
      };
    };
    expect(payload.result.structuredContent.ok).toBe(true);
    expect(payload.result.structuredContent.data.title).toBe('Implement sign-in');
  });

  it('calls story_update and returns not-found as MCP error payload', async () => {
    const fakeSupabase = { from: vi.fn(), rpc: vi.fn() } as never;

    vi.spyOn(storymapService, 'updateStory').mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'No rows found' },
    } as never);

    const response = await handleMcpRequest(
      rpcRequest({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'story_update',
          arguments: {
            story_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
            status: 'done',
          },
        },
      }),
      fakeSupabase,
      user,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      result: {
        isError: boolean;
        structuredContent: { ok: boolean; error: string };
      };
    };
    expect(payload.result.isError).toBe(true);
    expect(payload.result.structuredContent.ok).toBe(false);
    expect(payload.result.structuredContent.error).toBe('Story not found');
  });

  it('calls story_reorder with full ordering payload', async () => {
    const fakeSupabase = { from: vi.fn(), rpc: vi.fn() } as never;

    const reorderStoriesSpy = vi.spyOn(storymapService, 'reorderStories').mockResolvedValue({
      data: null,
      error: null,
    } as never);

    const response = await handleMcpRequest(
      rpcRequest({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'story_reorder',
          arguments: {
            task_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
            release_id: null,
            order: ['d7f34189-5d27-4dc0-b2c5-23d11796add4', '34e8bb98-8f40-4331-8df2-8f83fd8c7af4'],
          },
        },
      }),
      fakeSupabase,
      user,
    );

    expect(response.status).toBe(200);
    expect(reorderStoriesSpy).toHaveBeenCalledWith(fakeSupabase, {
      task_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
      release_id: null,
      order: ['d7f34189-5d27-4dc0-b2c5-23d11796add4', '34e8bb98-8f40-4331-8df2-8f83fd8c7af4'],
    });

    const payload = (await response.json()) as {
      result: {
        structuredContent: {
          ok: boolean;
          data: { reordered: number };
        };
      };
    };
    expect(payload.result.structuredContent.ok).toBe(true);
    expect(payload.result.structuredContent.data.reordered).toBe(2);
  });
});
