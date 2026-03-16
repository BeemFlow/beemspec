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
    expect(toolNames.has('task_move')).toBe(true);
    expect(toolNames.has('release_create')).toBe(true);
    expect(toolNames.has('story_create')).toBe(true);
    expect(toolNames.has('story_move')).toBe(true);
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
            operating_mode: string[];
            clarification_policy: string[];
            tool_sequence: string[];
            implementation_principles: string[];
            safe_vs_unsafe_inference: {
              safe_to_infer: string[];
              unsafe_to_infer: string[];
            };
            story_quality_principles: string[];
          };
        };
      };
    };

    expect(payload.result.structuredContent.ok).toBe(true);
    expect(payload.result.structuredContent.data.operating_mode[0]).toContain('product-minded implementation partner');
    expect(payload.result.structuredContent.data.clarification_policy[0]).toContain('materially change');
    expect(payload.result.structuredContent.data.tool_sequence[0]).toContain('storymap_list');
    expect(payload.result.structuredContent.data.tool_sequence[1]).toContain('storymap_get');
    expect(payload.result.structuredContent.data.safe_vs_unsafe_inference.unsafe_to_infer[0]).toContain(
      'New product scope',
    );
    expect(payload.result.structuredContent.data.implementation_principles.join(' ')).toContain('Figma MCP server');
    expect(payload.result.structuredContent.data.story_quality_principles[0]).toContain('user-visible value');
  });

  it('returns story map insights with warnings and recommendations', async () => {
    const mapSingle = vi.fn().mockResolvedValue({
      data: { id: 'map-1', name: 'Core Product', description: 'Primary map' },
      error: null,
    });
    const activitiesOrder3 = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'activity-1',
          name: 'Frontend',
          tasks: [
            {
              id: 'task-1',
              name: 'API integration',
              stories: [
                {
                  id: 'story-1',
                  title: 'Build API endpoint',
                  status: 'backlog',
                  release_id: null,
                  content: {
                    acceptance_criteria: '- [ ] endpoint works',
                    figma_link: 'https://figma.com/design/abc/Test?node-id=1-2',
                  },
                },
              ],
            },
          ],
        },
      ],
      error: null,
    });
    const activitiesOrder2 = vi.fn().mockReturnValue({ order: activitiesOrder3 });
    const activitiesOrder1 = vi.fn().mockReturnValue({ order: activitiesOrder2 });
    const releasesOrder = vi.fn().mockResolvedValue({
      data: [{ id: 'release-1', name: 'Release 1' }],
      error: null,
    });
    const personasOrder = vi.fn().mockResolvedValue({
      data: [{ id: 'persona-1', name: 'Admin', goals: 'Ship safely' }],
      error: null,
    });

    const fakeSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'story_maps') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: mapSingle }) }) };
        }
        if (table === 'activities') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: activitiesOrder1 }) }) };
        }
        if (table === 'releases') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: releasesOrder }) }) };
        }
        if (table === 'personas') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: personasOrder }) }) };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
      rpc: vi.fn(),
    } as never;

    const response = await handleMcpRequest(
      rpcRequest({
        jsonrpc: '2.0',
        id: 31,
        method: 'tools/call',
        params: {
          name: 'storymap_get',
          arguments: { story_map_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4' },
        },
      }),
      fakeSupabase,
      user,
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('agent_insights');
    expect(body).toContain('storiesWithFigmaCount');
    expect(body).toContain('story_mapping_warnings');
    expect(body).toContain('Figma MCP server');
  });

  it('calls storymap_list through shared service path', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4', name: 'Core Product' }],
      error: null,
    });
    const storyMapsEq = vi.fn().mockReturnValue({ order });
    const storyMapsSelect = vi.fn().mockReturnValue({ eq: storyMapsEq });

    const teamMembersEq = vi.fn().mockResolvedValue({
      data: [{ team_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4', role: 'owner' }],
      error: null,
    });
    const teamMembersSelect = vi.fn().mockReturnValue({ eq: teamMembersEq });

    const teamsIn = vi.fn().mockResolvedValue({
      data: [{ id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4', name: 'Core Product' }],
      error: null,
    });
    const teamsSelect = vi.fn().mockReturnValue({ in: teamsIn });

    const from = vi.fn((table: string) => {
      if (table === 'team_members') return { select: teamMembersSelect };
      if (table === 'teams') return { select: teamsSelect };
      return { select: storyMapsSelect };
    });
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
    expect(from).toHaveBeenCalledWith('team_members');
    expect(from).toHaveBeenCalledWith('teams');
    expect(from).toHaveBeenCalledWith('story_maps');
    expect(storyMapsSelect).toHaveBeenCalledWith('*');
    expect(storyMapsEq).toHaveBeenCalledWith('team_id', 'd7f34189-5d27-4dc0-b2c5-23d11796add4');
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
        task_id: 'task-1',
        release_id: null,
        content: {
          acceptance_criteria: '- [ ] Sign in succeeds',
          figma_link: 'https://figma.com/design/abc/Test?node-id=1-2',
        },
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
              user_story: 'User can sign in',
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
          data: { id: string; title: string; agent_guidance: { verification_hints: string[] } };
        };
      };
    };
    expect(payload.result.structuredContent.ok).toBe(true);
    expect(payload.result.structuredContent.data.title).toBe('Implement sign-in');
    expect(payload.result.structuredContent.data.agent_guidance.verification_hints.join(' ')).toContain('Figma');
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
          data: { reordered: number; agent_guidance: { verification_hints: string[] } };
        };
      };
    };
    expect(payload.result.structuredContent.ok).toBe(true);
    expect(payload.result.structuredContent.data.reordered).toBe(2);
    expect(payload.result.structuredContent.data.agent_guidance.verification_hints.join(' ')).toContain(
      'destination lane',
    );
  });

  it('calls task_move through shared service path', async () => {
    const fakeSupabase = { from: vi.fn(), rpc: vi.fn() } as never;

    const moveTaskSpy = vi.spyOn(storymapService, 'moveTask').mockResolvedValue({
      data: null,
      error: null,
    } as never);

    const response = await handleMcpRequest(
      rpcRequest({
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'task_move',
          arguments: {
            task_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
            target_activity_id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4',
            target_order: ['d7f34189-5d27-4dc0-b2c5-23d11796add4'],
          },
        },
      }),
      fakeSupabase,
      user,
    );

    expect(response.status).toBe(200);
    expect(moveTaskSpy).toHaveBeenCalledWith(fakeSupabase, 'd7f34189-5d27-4dc0-b2c5-23d11796add4', {
      target_activity_id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4',
      target_order: ['d7f34189-5d27-4dc0-b2c5-23d11796add4'],
    });
  });

  it('calls story_move through shared service path', async () => {
    const fakeSupabase = { from: vi.fn(), rpc: vi.fn() } as never;

    const moveStorySpy = vi.spyOn(storymapService, 'moveStory').mockResolvedValue({
      data: null,
      error: null,
    } as never);

    const response = await handleMcpRequest(
      rpcRequest({
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'story_move',
          arguments: {
            story_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
            target_task_id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4',
            target_release_id: null,
            target_order: ['d7f34189-5d27-4dc0-b2c5-23d11796add4'],
          },
        },
      }),
      fakeSupabase,
      user,
    );

    expect(response.status).toBe(200);
    expect(moveStorySpy).toHaveBeenCalledWith(fakeSupabase, 'd7f34189-5d27-4dc0-b2c5-23d11796add4', {
      target_task_id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4',
      target_release_id: null,
      target_order: ['d7f34189-5d27-4dc0-b2c5-23d11796add4'],
    });
  });

  it('rejects parent changes through task_update tool input validation', async () => {
    const fakeSupabase = { from: vi.fn(), rpc: vi.fn() } as never;
    const updateTaskSpy = vi.spyOn(storymapService, 'updateTask');

    const response = await handleMcpRequest(
      rpcRequest({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'task_update',
          arguments: {
            task_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
            activity_id: '34e8bb98-8f40-4331-8df2-8f83fd8c7af4',
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
        structuredContent: { ok: boolean; error: string; details?: unknown };
      };
    };
    expect(payload.result.isError).toBe(true);
    expect(payload.result.structuredContent.ok).toBe(false);
    expect(payload.result.structuredContent.error).toBe('Validation failed');
    expect(updateTaskSpy).not.toHaveBeenCalled();
  });

  it('rejects placement changes through story_update tool input validation', async () => {
    const fakeSupabase = { from: vi.fn(), rpc: vi.fn() } as never;
    const updateStorySpy = vi.spyOn(storymapService, 'updateStory');

    const response = await handleMcpRequest(
      rpcRequest({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'story_update',
          arguments: {
            story_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
            release_id: null,
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
        structuredContent: { ok: boolean; error: string; details?: unknown };
      };
    };
    expect(payload.result.isError).toBe(true);
    expect(payload.result.structuredContent.ok).toBe(false);
    expect(payload.result.structuredContent.error).toBe('Validation failed');
    expect(updateStorySpy).not.toHaveBeenCalled();
  });

  it('returns context for a backlog story', async () => {
    const fakeSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'stories') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
                    task_id: 'task-1',
                    title: 'Backlog story',
                    status: 'backlog',
                    sort_order: 3,
                    release_id: null,
                    content: {
                      user_story: 'Do the backlog thing',
                      acceptance_criteria: 'It works from backlog',
                      edge_cases: 'Handle empty states',
                      technical_guidelines: 'Keep it simple',
                      figma_link: 'https://figma.com/design/abc/Test?node-id=1-2',
                    },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'tasks') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'task-1',
                    activity_id: 'activity-1',
                    name: 'Review backlog item',
                    description: 'Review the story before development',
                    sort_order: 2,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'activities') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'activity-1',
                    story_map_id: 'map-1',
                    name: 'Plan work',
                    description: 'Plan the release',
                    sort_order: 1,
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'story_maps') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'map-1',
                    name: 'Core Product',
                    description: 'Primary planning map',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'personas') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'persona-1',
                      name: 'Workspace Admin',
                      description: 'Manages the rollout',
                      goals: 'Ship safely',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    } as never;

    const response = await handleMcpRequest(
      rpcRequest({
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: {
          name: 'story_context_get',
          arguments: {
            story_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
          },
        },
      }),
      fakeSupabase,
      user,
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      result: {
        structuredContent: {
          ok: boolean;
          data: {
            releaseId: string | null;
            releaseName: string | null;
            storyId: string;
            storyTitle: string;
            storyStatus: string;
            storyMapName: string;
            activityName: string;
            taskName: string;
            userStory: string;
            acceptanceCriteria: string;
            edgeCases: string | null;
            technicalGuidelines: string | null;
            figmaLink: string | null;
            personas: Array<{ name: string }>;
            agentGuidance: {
              riskFlags: string[];
              missingContext: string[];
              verificationFocus: string[];
              figma: {
                hasFigmaLink: boolean;
                recommendedTools: string[];
              };
            };
          };
        };
      };
    };

    expect(payload.result.structuredContent.ok).toBe(true);
    expect(payload.result.structuredContent.data.releaseId).toBeNull();
    expect(payload.result.structuredContent.data.releaseName).toBeNull();
    expect(payload.result.structuredContent.data.storyTitle).toBe('Backlog story');
    expect(payload.result.structuredContent.data.storyStatus).toBe('backlog');
    expect(payload.result.structuredContent.data.storyMapName).toBe('Core Product');
    expect(payload.result.structuredContent.data.activityName).toBe('Plan work');
    expect(payload.result.structuredContent.data.taskName).toBe('Review backlog item');
    expect(payload.result.structuredContent.data.edgeCases).toBe('Handle empty states');
    expect(payload.result.structuredContent.data.figmaLink).toContain('figma.com');
    expect(payload.result.structuredContent.data.personas).toHaveLength(1);
    expect(payload.result.structuredContent.data.agentGuidance.riskFlags[0]).toContain('Linked design context');
    expect(payload.result.structuredContent.data.agentGuidance.verificationFocus[0]).toContain('acceptance criteria');
    expect(payload.result.structuredContent.data.agentGuidance.figma.hasFigmaLink).toBe(true);
    expect(payload.result.structuredContent.data.agentGuidance.figma.recommendedTools).toContain(
      'figma_get_design_context',
    );
  });

  it('returns not found for missing story context', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq });
    const fakeSupabase = { from: vi.fn().mockReturnValue({ select }) } as never;

    const response = await handleMcpRequest(
      rpcRequest({
        jsonrpc: '2.0',
        id: 13,
        method: 'tools/call',
        params: {
          name: 'story_context_get',
          arguments: {
            story_id: 'd7f34189-5d27-4dc0-b2c5-23d11796add4',
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
    expect(payload.result.structuredContent.error).toBe('Story not found');
  });
});
