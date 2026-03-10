import {
  createActivitySchema,
  createPersonaSchema,
  createReleaseSchema,
  createStoryMapSchema,
  createStorySchema,
  createTaskSchema,
  moveStorySchema,
  moveTaskSchema,
  reorderActivitiesSchema,
  reorderReleasesSchema,
  reorderStoriesSchema,
  reorderTasksSchema,
  updateActivitySchema,
  updatePersonaSchema,
  updateReleaseSchema,
  updateStoryMapSchema,
  updateStorySchema,
  updateTaskSchema,
} from '@beemspec/storymap';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import type { AuthenticatedUser } from '@/lib/auth';
import { DbErrorCode } from '@/lib/errors';
import type { Supabase } from '@/lib/supabase/types';
import { listTeamsForUser } from '@/lib/teams';
import {
  createActivity,
  createPersona,
  createRelease,
  createStory,
  createStoryMap,
  createTask,
  deleteActivity,
  deletePersona,
  deleteRelease,
  deleteStory,
  deleteTask,
  getStory,
  getStoryMapGraph,
  listPersonas,
  listStoryMaps,
  moveStory,
  moveTask,
  reorderActivities,
  reorderReleases,
  reorderStories,
  reorderTasks,
  updateActivity,
  updatePersona,
  updateRelease,
  updateStory,
  updateStoryMap,
  updateTask,
} from '@/storymap/service';
import { getStoryContext } from './queries';

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function successResult<T>(data: T) {
  const payload = { ok: true as const, data };
  return {
    content: [{ type: 'text' as const, text: jsonText(payload) }],
    structuredContent: payload,
  };
}

function errorResult(error: string, details?: unknown) {
  const payload = {
    ok: false as const,
    error,
    ...(details ? { details } : {}),
  };
  return {
    isError: true,
    content: [{ type: 'text' as const, text: jsonText(payload) }],
    structuredContent: payload,
  };
}

function dbCode(error: unknown): string | null {
  if (typeof error !== 'object' || !error) return null;
  const code = Reflect.get(error, 'code');
  return typeof code === 'string' ? code : null;
}

function isNotFound(error: unknown): boolean {
  return dbCode(error) === DbErrorCode.NOT_FOUND;
}

function describeDbError(error: unknown): Record<string, unknown> {
  if (typeof error !== 'object' || !error) return { message: 'Unknown database error' };

  const message = Reflect.get(error, 'message');
  const details = Reflect.get(error, 'details');
  const hint = Reflect.get(error, 'hint');
  const code = Reflect.get(error, 'code');

  return {
    ...(typeof message === 'string' ? { message } : {}),
    ...(typeof details === 'string' ? { details } : {}),
    ...(typeof hint === 'string' ? { hint } : {}),
    ...(typeof code === 'string' ? { code } : {}),
  };
}

type ToolCall<Input> = (args: Input) => Promise<ReturnType<typeof successResult> | ReturnType<typeof errorResult>>;

function withToolErrorBoundary<Input>(name: string, handler: ToolCall<Input>): ToolCall<Input> {
  return async (args: Input) => {
    try {
      return await handler(args);
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: MCP tool runtime error logging
      console.error(`[mcp] ${name} failed`, error);
      return errorResult('Unexpected server error', describeDbError(error));
    }
  };
}

const readAnnotations = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const mutateAnnotations = {
  readOnlyHint: false,
  idempotentHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const destructiveAnnotations = {
  ...mutateAnnotations,
  destructiveHint: true,
} as const;

async function resolveAccessibleTeamId(
  supabase: Supabase,
  userId: string,
  teamId: string | undefined,
): Promise<{ ok: true; teamId: string } | { ok: false; response: ReturnType<typeof errorResult> }> {
  if (teamId) {
    const teamsResult = await listTeamsForUser(supabase, userId);
    if (teamsResult.error || !teamsResult.data) {
      return { ok: false, response: errorResult('Failed to resolve team', describeDbError(teamsResult.error)) };
    }

    const isMember = teamsResult.data.some((team) => team.team_id === teamId);
    if (!isMember) {
      return { ok: false, response: errorResult('Provided team_id is not accessible to authenticated user') };
    }

    return { ok: true, teamId };
  }

  const teamsResult = await listTeamsForUser(supabase, userId);
  if (teamsResult.error || !teamsResult.data) {
    return { ok: false, response: errorResult('Failed to resolve team', describeDbError(teamsResult.error)) };
  }

  if (teamsResult.data.length === 0) {
    return { ok: false, response: errorResult('No accessible teams found for authenticated user') };
  }

  if (teamsResult.data.length > 1) {
    return {
      ok: false,
      response: errorResult('Multiple teams found. Pass team_id or call team_list first.', {
        teams: teamsResult.data,
      }),
    };
  }

  return { ok: true, teamId: teamsResult.data[0].team_id };
}

async function resolveStoryMapIdByName(
  supabase: Supabase,
  storyMapName: string,
  teamId?: string,
): Promise<{ ok: true; storyMapId: string } | { ok: false; response: ReturnType<typeof errorResult> }> {
  let query = supabase.from('story_maps').select('id, name, team_id').eq('name', storyMapName);
  if (teamId) query = query.eq('team_id', teamId);

  const { data, error } = await query;
  if (error) {
    return { ok: false, response: errorResult('Failed to resolve story map by name', describeDbError(error)) };
  }

  const matches = data ?? [];
  if (matches.length === 0) {
    return { ok: false, response: errorResult('Story map not found by name') };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      response: errorResult('Multiple story maps matched this name. Pass story_map_id or team_id.', {
        matches,
      }),
    };
  }

  return { ok: true, storyMapId: matches[0].id as string };
}

function createMcpServer(supabase: Supabase, user: AuthenticatedUser): McpServer {
  const server = new McpServer({
    name: 'beemspec',
    version: '0.1.0',
  });
  const getUserScopedClient = () => supabase;

  server.registerTool(
    'team_list',
    {
      title: 'List Teams',
      description: 'List teams available to the authenticated user. Use this when team_id is unknown.',
      annotations: readAnnotations,
    },
    withToolErrorBoundary('team_list', async () => {
      const supabase = getUserScopedClient();
      const { data, error } = await listTeamsForUser(supabase, user.id);
      if (error || !data) return errorResult('Failed to load teams', describeDbError(error));
      return successResult(data);
    }),
  );

  server.registerTool(
    'storymap_workflow_guide',
    {
      title: 'Story Map Workflow Guide',
      description:
        'CALL THIS FIRST BEFORE TOUCHING THE STORYMAP. Read-first guide for agents to plan minimal tool calls before any edits.',
      annotations: readAnnotations,
    },
    withToolErrorBoundary('storymap_workflow_guide', async () => {
      return successResult({
        objective: 'Understand full context in one read, then apply targeted mutations.',
        recommended_sequence: [
          '1) Call storymap_list(team_id?) to discover candidate maps (team_id optional when user has one team).',
          '2) Call storymap_get(story_map_id) to load complete map graph (activities, tasks, stories, releases, personas).',
          '3) Perform create/update/reorder/delete operations as needed.',
          '4) Call storymap_get(story_map_id) again to verify final state and ordering.',
        ],
        notes: [
          'Prefer storymap_get over many small reads when planning.',
          'Use *_reorder tools only after IDs are known from storymap_get.',
          'Use story_context_get only when you need coding-focused context for a specific story.',
        ],
      });
    }),
  );

  server.registerTool(
    'storymap_list',
    {
      title: 'List Story Maps',
      description:
        'Starting point. List story maps for a team. team_id is optional when the user has exactly one team.',
      inputSchema: {
        team_id: z.string().uuid().optional().describe('Team UUID (optional for single-team users)'),
      },
      annotations: readAnnotations,
    },
    withToolErrorBoundary('storymap_list', async ({ team_id }) => {
      const supabase = getUserScopedClient();
      const resolvedTeam = await resolveAccessibleTeamId(supabase, user.id, team_id);
      if (!resolvedTeam.ok) return resolvedTeam.response;

      const { data, error } = await listStoryMaps(supabase, resolvedTeam.teamId);

      if (error) {
        return errorResult('Failed to load story maps', describeDbError(error));
      }

      return successResult(data ?? []);
    }),
  );

  server.registerTool(
    'storymap_get',
    {
      title: 'Get Story Map',
      description:
        'Primary context loader. Pass story_map_id directly, or pass story_map_name (and optional team_id) for resolution.',
      inputSchema: {
        story_map_id: z.string().uuid().optional().describe('Story map UUID'),
        story_map_name: z.string().min(1).max(200).optional().describe('Story map name'),
        team_id: z.string().uuid().optional().describe('Team UUID for disambiguating name matches'),
      },
      annotations: readAnnotations,
    },
    withToolErrorBoundary('storymap_get', async ({ story_map_id, story_map_name, team_id }) => {
      const supabase = getUserScopedClient();
      let resolvedStoryMapId = story_map_id;

      if (!resolvedStoryMapId && story_map_name) {
        const resolved = await resolveStoryMapIdByName(supabase, story_map_name, team_id);
        if (!resolved.ok) return resolved.response;
        resolvedStoryMapId = resolved.storyMapId;
      }

      if (!resolvedStoryMapId) {
        return errorResult('Provide story_map_id or story_map_name');
      }

      const { mapResult, activitiesResult, releasesResult, personasResult } = await getStoryMapGraph(
        supabase,
        resolvedStoryMapId,
        {
          includePersonas: true,
        },
      );

      if (mapResult.error) {
        if (isNotFound(mapResult.error)) return errorResult('Story map not found');
        return errorResult('Failed to load story map', describeDbError(mapResult.error));
      }
      if (activitiesResult.error) {
        return errorResult('Failed to load activities', describeDbError(activitiesResult.error));
      }
      if (releasesResult.error) {
        return errorResult('Failed to load releases', describeDbError(releasesResult.error));
      }
      if (personasResult.error) {
        return errorResult('Failed to load personas', describeDbError(personasResult.error));
      }

      return successResult({
        ...mapResult.data,
        activities: activitiesResult.data ?? [],
        releases: releasesResult.data ?? [],
        personas: personasResult.data ?? [],
      });
    }),
  );

  server.registerTool(
    'storymap_create',
    {
      title: 'Create Story Map',
      description:
        'Create a new story map container. team_id is optional when user has exactly one team. Call storymap_get afterward for full context.',
      inputSchema: {
        team_id: z.string().uuid().optional().describe('Team UUID (optional for single-team users)'),
        name: createStoryMapSchema.shape.name,
        description: createStoryMapSchema.shape.description,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('storymap_create', async (input) => {
      const supabase = getUserScopedClient();
      const resolvedTeam = await resolveAccessibleTeamId(supabase, user.id, input.team_id);
      if (!resolvedTeam.ok) return resolvedTeam.response;

      const { data, error } = await createStoryMap(supabase, {
        team_id: resolvedTeam.teamId,
        name: input.name,
        description: input.description,
      });

      if (error) return errorResult('Failed to create story map', describeDbError(error));
      return successResult(data);
    }),
  );

  server.registerTool(
    'storymap_update',
    {
      title: 'Update Story Map',
      description:
        'Update story map metadata (name/description). Re-read with storymap_get to continue planning safely.',
      inputSchema: {
        story_map_id: z.string().uuid(),
        ...updateStoryMapSchema.shape,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('storymap_update', async ({ story_map_id, ...changes }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await updateStoryMap(supabase, story_map_id, changes);

      if (error) {
        if (isNotFound(error)) return errorResult('Story map not found');
        return errorResult('Failed to update story map', describeDbError(error));
      }

      return successResult(data);
    }),
  );

  server.registerTool(
    'activity_create',
    {
      title: 'Create Activity',
      description: 'Create an activity column in a story map. Use IDs from storymap_get and refresh after mutation.',
      inputSchema: createActivitySchema.shape,
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('activity_create', async (input) => {
      const supabase = getUserScopedClient();
      const { data, error } = await createActivity(supabase, input);

      if (error) return errorResult('Failed to create activity', describeDbError(error));
      return successResult(data);
    }),
  );

  server.registerTool(
    'activity_update',
    {
      title: 'Update Activity',
      description: 'Update activity fields (name/description/sort_order). Use when ID is already known.',
      inputSchema: {
        activity_id: z.string().uuid(),
        ...updateActivitySchema.shape,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('activity_update', async ({ activity_id, ...changes }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await updateActivity(supabase, activity_id, changes);

      if (error) {
        if (isNotFound(error)) return errorResult('Activity not found');
        return errorResult('Failed to update activity', describeDbError(error));
      }
      return successResult(data);
    }),
  );

  server.registerTool(
    'activity_delete',
    {
      title: 'Delete Activity',
      description: 'Destructive. Deletes an activity and all nested tasks/stories under it.',
      inputSchema: {
        activity_id: z.string().uuid(),
      },
      annotations: destructiveAnnotations,
    },
    withToolErrorBoundary('activity_delete', async ({ activity_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await deleteActivity(supabase, activity_id);

      if (error) {
        if (isNotFound(error)) return errorResult('Activity not found');
        return errorResult('Failed to delete activity', describeDbError(error));
      }
      return successResult({ deleted: data });
    }),
  );

  server.registerTool(
    'activity_reorder',
    {
      title: 'Reorder Activities',
      description: 'Reorder activities in final sequence. Provide full ordered ID list from storymap_get context.',
      inputSchema: reorderActivitiesSchema.shape,
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('activity_reorder', async ({ story_map_id, order }) => {
      const supabase = getUserScopedClient();
      const { error } = await reorderActivities(supabase, { story_map_id, order });

      if (error) return errorResult('Failed to reorder activities', describeDbError(error));
      return successResult({ reordered: order.length });
    }),
  );

  server.registerTool(
    'task_create',
    {
      title: 'Create Task',
      description: 'Create a task under an activity. Choose target activity from storymap_get output.',
      inputSchema: createTaskSchema.shape,
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('task_create', async (input) => {
      const supabase = getUserScopedClient();
      const { data, error } = await createTask(supabase, input);

      if (error) return errorResult('Failed to create task', describeDbError(error));
      return successResult(data);
    }),
  );

  server.registerTool(
    'task_update',
    {
      title: 'Update Task',
      description: 'Update task fields (name/description/sort_order/activity_id). Use when task ID is known.',
      inputSchema: {
        task_id: z.string().uuid(),
        ...updateTaskSchema.shape,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('task_update', async ({ task_id, ...changes }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await updateTask(supabase, task_id, changes);

      if (error) {
        if (isNotFound(error)) return errorResult('Task not found');
        return errorResult('Failed to update task', describeDbError(error));
      }
      return successResult(data);
    }),
  );

  server.registerTool(
    'task_delete',
    {
      title: 'Delete Task',
      description: 'Destructive. Deletes a task and all stories under it.',
      inputSchema: {
        task_id: z.string().uuid(),
      },
      annotations: destructiveAnnotations,
    },
    withToolErrorBoundary('task_delete', async ({ task_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await deleteTask(supabase, task_id);

      if (error) {
        if (isNotFound(error)) return errorResult('Task not found');
        return errorResult('Failed to delete task', describeDbError(error));
      }
      return successResult({ deleted: data });
    }),
  );

  server.registerTool(
    'task_reorder',
    {
      title: 'Reorder Tasks',
      description: 'Reorder tasks within an activity. Provide full ordered ID list for that activity.',
      inputSchema: reorderTasksSchema.shape,
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('task_reorder', async ({ activity_id, order }) => {
      const supabase = getUserScopedClient();
      const { error } = await reorderTasks(supabase, { activity_id, order });

      if (error) return errorResult('Failed to reorder tasks', describeDbError(error));
      return successResult({ reordered: order.length });
    }),
  );

  server.registerTool(
    'task_move',
    {
      title: 'Move Task',
      description: 'Atomically move a task to another activity and set full target order in one operation.',
      inputSchema: {
        task_id: z.string().uuid(),
        ...moveTaskSchema.shape,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('task_move', async ({ task_id, ...input }) => {
      const supabase = getUserScopedClient();
      const { error } = await moveTask(supabase, task_id, input);

      if (error) return errorResult('Failed to move task', describeDbError(error));
      return successResult({ moved: task_id });
    }),
  );

  server.registerTool(
    'release_create',
    {
      title: 'Create Release',
      description: 'Create a release lane (row) in a story map. Useful before placing or moving stories.',
      inputSchema: createReleaseSchema.shape,
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('release_create', async (input) => {
      const supabase = getUserScopedClient();
      const { data, error } = await createRelease(supabase, input);

      if (error) return errorResult('Failed to create release', describeDbError(error));
      return successResult(data);
    }),
  );

  server.registerTool(
    'release_update',
    {
      title: 'Update Release',
      description: 'Update release fields (name/description/sort_order).',
      inputSchema: {
        release_id: z.string().uuid(),
        ...updateReleaseSchema.shape,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('release_update', async ({ release_id, ...changes }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await updateRelease(supabase, release_id, changes);

      if (error) {
        if (isNotFound(error)) return errorResult('Release not found');
        return errorResult('Failed to update release', describeDbError(error));
      }
      return successResult(data);
    }),
  );

  server.registerTool(
    'release_delete',
    {
      title: 'Delete Release',
      description: 'Destructive. Deletes a release and stories currently assigned to that release.',
      inputSchema: {
        release_id: z.string().uuid(),
      },
      annotations: destructiveAnnotations,
    },
    withToolErrorBoundary('release_delete', async ({ release_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await deleteRelease(supabase, release_id);

      if (error) {
        if (isNotFound(error)) return errorResult('Release not found');
        return errorResult('Failed to delete release', describeDbError(error));
      }
      return successResult({ deleted: data });
    }),
  );

  server.registerTool(
    'release_reorder',
    {
      title: 'Reorder Releases',
      description: 'Reorder release lanes in final sequence. Provide full ordered release ID list.',
      inputSchema: reorderReleasesSchema.shape,
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('release_reorder', async ({ story_map_id, order }) => {
      const supabase = getUserScopedClient();
      const { error } = await reorderReleases(supabase, { story_map_id, order });

      if (error) return errorResult('Failed to reorder releases', describeDbError(error));
      return successResult({ reordered: order.length });
    }),
  );

  server.registerTool(
    'story_get',
    {
      title: 'Get Story',
      description: 'Load one story by ID when full map context is not required.',
      inputSchema: {
        story_id: z.string().uuid(),
      },
      annotations: readAnnotations,
    },
    withToolErrorBoundary('story_get', async ({ story_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await getStory(supabase, story_id);

      if (error) {
        if (isNotFound(error)) return errorResult('Story not found');
        return errorResult('Failed to load story', describeDbError(error));
      }
      return successResult(data);
    }),
  );

  server.registerTool(
    'story_create',
    {
      title: 'Create Story',
      description: 'Create a story in a task/release cell. Requires task_id and structured story content.',
      inputSchema: createStorySchema.shape,
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('story_create', async (input) => {
      const supabase = getUserScopedClient();
      const { data, error } = await createStory(supabase, input);

      if (error) return errorResult('Failed to create story', describeDbError(error));
      return successResult(data);
    }),
  );

  server.registerTool(
    'story_update',
    {
      title: 'Update Story',
      description: 'Update story fields/status/placement. Use to move between releases or change execution state.',
      inputSchema: {
        story_id: z.string().uuid(),
        ...updateStorySchema.shape,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('story_update', async ({ story_id, ...changes }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await updateStory(supabase, story_id, changes);

      if (error) {
        if (isNotFound(error)) return errorResult('Story not found');
        return errorResult('Failed to update story', describeDbError(error));
      }
      return successResult(data);
    }),
  );

  server.registerTool(
    'story_delete',
    {
      title: 'Delete Story',
      description: 'Destructive. Deletes a story from the map.',
      inputSchema: {
        story_id: z.string().uuid(),
      },
      annotations: destructiveAnnotations,
    },
    withToolErrorBoundary('story_delete', async ({ story_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await deleteStory(supabase, story_id);

      if (error) {
        if (isNotFound(error)) return errorResult('Story not found');
        return errorResult('Failed to delete story', describeDbError(error));
      }

      return successResult({ deleted: data });
    }),
  );

  server.registerTool(
    'story_reorder',
    {
      title: 'Reorder Stories',
      description: 'Reorder stories within a specific task+release cell using a full ordered story ID list.',
      inputSchema: reorderStoriesSchema.shape,
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('story_reorder', async ({ task_id, release_id, order }) => {
      const supabase = getUserScopedClient();
      const { error } = await reorderStories(supabase, { task_id, release_id, order });

      if (error) return errorResult('Failed to reorder stories', describeDbError(error));
      return successResult({ reordered: order.length });
    }),
  );

  server.registerTool(
    'story_move',
    {
      title: 'Move Story',
      description: 'Atomically move a story to another task/release cell and set full target order in one operation.',
      inputSchema: {
        story_id: z.string().uuid(),
        ...moveStorySchema.shape,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('story_move', async ({ story_id, ...input }) => {
      const supabase = getUserScopedClient();
      const { error } = await moveStory(supabase, story_id, input);

      if (error) return errorResult('Failed to move story', describeDbError(error));
      return successResult({ moved: story_id });
    }),
  );

  server.registerTool(
    'persona_list',
    {
      title: 'List Personas',
      description: 'List personas attached to a story map. Prefer storymap_get if you already need full map context.',
      inputSchema: {
        story_map_id: z.string().uuid(),
      },
      annotations: readAnnotations,
    },
    withToolErrorBoundary('persona_list', async ({ story_map_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await listPersonas(supabase, story_map_id);

      if (error) return errorResult('Failed to load personas', describeDbError(error));
      return successResult(data ?? []);
    }),
  );

  server.registerTool(
    'persona_create',
    {
      title: 'Create Persona',
      description: 'Create a persona for a story map to capture user archetypes and goals.',
      inputSchema: createPersonaSchema.shape,
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('persona_create', async (input) => {
      const supabase = getUserScopedClient();
      const { data, error } = await createPersona(supabase, input);

      if (error) return errorResult('Failed to create persona', describeDbError(error));
      return successResult(data);
    }),
  );

  server.registerTool(
    'persona_update',
    {
      title: 'Update Persona',
      description: 'Update persona fields (name/description/goals/sort_order).',
      inputSchema: {
        persona_id: z.string().uuid(),
        ...updatePersonaSchema.shape,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('persona_update', async ({ persona_id, ...changes }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await updatePersona(supabase, persona_id, changes);

      if (error) {
        if (isNotFound(error)) return errorResult('Persona not found');
        return errorResult('Failed to update persona', describeDbError(error));
      }

      return successResult(data);
    }),
  );

  server.registerTool(
    'persona_delete',
    {
      title: 'Delete Persona',
      description: 'Destructive. Deletes a persona from the story map.',
      inputSchema: {
        persona_id: z.string().uuid(),
      },
      annotations: destructiveAnnotations,
    },
    withToolErrorBoundary('persona_delete', async ({ persona_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await deletePersona(supabase, persona_id);

      if (error) {
        if (isNotFound(error)) return errorResult('Persona not found');
        return errorResult('Failed to delete persona', describeDbError(error));
      }

      return successResult({ deleted: data });
    }),
  );

  server.registerTool(
    'story_context_get',
    {
      title: 'Get Story Context',
      description:
        'Coding-focused context for one story. Use after selecting a story via storymap_get, not as full-map discovery.',
      inputSchema: {
        story_id: z.string().uuid().describe('BeemSpec story UUID'),
      },
      annotations: readAnnotations,
    },
    withToolErrorBoundary('story_context_get', async ({ story_id }) => {
      const supabase = getUserScopedClient();
      const context = await getStoryContext(supabase, story_id);

      if (!context) {
        return errorResult('Story not found or not assigned to a release');
      }

      return successResult(context);
    }),
  );

  return server;
}

async function handleMcpRequestOnce(request: Request, supabase: Supabase, user: AuthenticatedUser): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createMcpServer(supabase, user);
  await server.connect(transport);

  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close().catch(() => {
      // no-op on cleanup failures
    });
  }
}

export async function handleMcpRequest(
  request: Request,
  supabase: Supabase,
  user: AuthenticatedUser,
): Promise<Response> {
  return handleMcpRequestOnce(request, supabase, user);
}
