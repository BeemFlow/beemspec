import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { createStoryMapSchema } from '@/domain/story-map';
import { updateStoryMapToolSchema } from '@/domain/story-map/schemas';
import type { AuthenticatedUser } from '@/lib/auth';
import type { Supabase } from '@/lib/supabase/types';
import {
  createStoryMap,
  getReleaseMcpContext,
  getStoryMapMcpContext,
  listStoryMaps,
  updateStoryMap,
} from '@/storymap/service';
import {
  buildPlanningLanes,
  buildStoryMapInsights,
  filterActivitiesForRelease,
  toStoryPlanningRef,
} from '../insights/story-map';
import { mcpUuidSchema, successOutputSchema } from '../output-schemas';
import {
  createAnnotations,
  describeDbError,
  errorResult,
  isNotFound,
  readAnnotations,
  resolveAccessibleTeamId,
  resolveStoryMapIdByName,
  successResult,
  updateAnnotations,
  withToolErrorBoundary,
} from '../tool-support';

const createStoryMapToolSchema = createStoryMapSchema.extend({
  team_id: z.string().uuid().optional().describe('Team UUID (optional for single-team users)'),
});

const nullableTextSchema = z.string().nullable();
const storyMapRowSchema = z
  .object({
    id: mcpUuidSchema,
    name: z.string(),
    description: nullableTextSchema.optional(),
    context_markdown: nullableTextSchema.optional(),
  })
  .passthrough();
const releaseRowSchema = z
  .object({
    id: mcpUuidSchema,
    story_map_id: mcpUuidSchema,
    name: z.string(),
    description: nullableTextSchema,
    context_markdown: nullableTextSchema,
    sort_order: z.number().int(),
  })
  .passthrough();
const personaRowSchema = z
  .object({
    id: mcpUuidSchema,
    name: z.string(),
    description: nullableTextSchema.optional(),
    goals: nullableTextSchema.optional(),
  })
  .passthrough();
const storyPlanningRefSchema = z
  .object({
    id: mcpUuidSchema,
    title: z.string(),
    status: z.string(),
    release_id: mcpUuidSchema.nullable(),
    has_figma_link: z.boolean(),
    has_edge_cases: z.boolean(),
  })
  .strict();
const taskContextSchema = z
  .object({
    id: mcpUuidSchema,
    activity_id: mcpUuidSchema,
    name: z.string(),
    description: nullableTextSchema,
    sort_order: z.number().int(),
    stories: z.array(storyPlanningRefSchema),
  })
  .passthrough();
const activityContextSchema = z
  .object({
    id: mcpUuidSchema,
    story_map_id: mcpUuidSchema,
    name: z.string(),
    description: nullableTextSchema,
    sort_order: z.number().int(),
    tasks: z.array(taskContextSchema),
  })
  .passthrough();
const storyMapInsightsSchema = z
  .object({
    map_summary: z
      .object({
        storyMapId: mcpUuidSchema,
        storyMapName: z.string(),
        activityCount: z.number().int().nonnegative(),
        taskCount: z.number().int().nonnegative(),
        releaseCount: z.number().int().nonnegative(),
        personaCount: z.number().int().nonnegative(),
        storyCount: z.number().int().nonnegative(),
      })
      .passthrough(),
    top_risk_flags: z.array(z.string()),
    story_mapping_warnings: z.array(z.string()),
    recommended_next_actions: z.array(z.string()),
  })
  .passthrough();
const storyMapContextSchema = storyMapRowSchema.extend({
  activities: z.array(activityContextSchema),
  releases: z.array(releaseRowSchema),
  planning_lanes: z.array(
    z
      .object({
        releaseId: mcpUuidSchema.nullable(),
        releaseName: z.string(),
      })
      .strict(),
  ),
  personas: z.array(personaRowSchema),
  agent_insights: storyMapInsightsSchema,
});
const releaseContextSchema = z
  .object({
    release: releaseRowSchema,
    story_map: storyMapRowSchema,
    activities: z.array(activityContextSchema),
    summary: z
      .object({
        storyCount: z.number().int().nonnegative(),
        unfinishedCount: z.number().int().nonnegative(),
        storiesWithFigmaCount: z.number().int().nonnegative(),
        storiesMissingEdgeCasesCount: z.number().int().nonnegative(),
      })
      .strict(),
    warnings: z.array(z.string()),
  })
  .strict();

const storyMapLookupSchema = z
  .object({
    story_map_id: z.string().uuid().optional().describe('Story map UUID; mutually exclusive with story_map_name'),
    story_map_name: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe('Exact story map name; mutually exclusive with story_map_id'),
    team_id: z
      .string()
      .uuid()
      .optional()
      .describe('Only used with story_map_name to disambiguate identical names across accessible teams'),
  })
  .strict()
  .refine((input) => Boolean(input.story_map_id) !== Boolean(input.story_map_name), {
    message: 'Provide exactly one of story_map_id or story_map_name',
  });

export function registerStoryMapTools(server: McpServer, supabase: Supabase, user: AuthenticatedUser): void {
  const getUserScopedClient = () => supabase;
  server.registerTool(
    'storymap_list',
    {
      title: 'List Story Maps',
      description:
        'Starting point. List story maps for a team. team_id is optional when the user has exactly one team.',
      inputSchema: z
        .object({ team_id: z.string().uuid().optional().describe('Team UUID (optional for single-team users)') })
        .strict(),
      outputSchema: successOutputSchema(z.array(storyMapRowSchema)),
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
        'Primary context loader. Select exactly one story map by UUID or exact name; team_id only disambiguates name lookup.',
      inputSchema: storyMapLookupSchema,
      outputSchema: successOutputSchema(storyMapContextSchema),
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

      const { mapResult, activitiesResult, releasesResult, personasResult } = await getStoryMapMcpContext(
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

      const activities = (activitiesResult.data ?? []).map((activity) => ({
        ...activity,
        tasks: (activity.tasks ?? []).map((task) => ({
          ...task,
          stories: (task.stories ?? []).map(toStoryPlanningRef),
        })),
      }));
      const releases = releasesResult.data ?? [];
      const personas = personasResult.data ?? [];
      const data = {
        ...mapResult.data,
        activities,
        releases,
        planning_lanes: buildPlanningLanes(releases),
        personas,
      };

      return successResult({
        ...data,
        agent_insights: buildStoryMapInsights({
          map: data,
          activities: data.activities,
          releases: data.releases,
          personas: data.personas,
        }),
      });
    }),
  );

  server.registerTool(
    'release_get',
    {
      title: 'Get Release',
      description:
        'Load one release with release context and lightweight story references. Use this for release planning and scope review.',
      inputSchema: z.object({ release_id: z.string().uuid().describe('Release UUID') }).strict(),
      outputSchema: successOutputSchema(releaseContextSchema),
      annotations: readAnnotations,
    },
    withToolErrorBoundary('release_get', async ({ release_id }) => {
      const supabase = getUserScopedClient();
      const { releaseResult, mapResult, activitiesResult } = await getReleaseMcpContext(supabase, release_id);

      if (releaseResult.error) {
        if (isNotFound(releaseResult.error)) return errorResult('Release not found');
        return errorResult('Failed to load release', describeDbError(releaseResult.error));
      }
      if (mapResult.error) {
        return errorResult('Failed to load story map for release', describeDbError(mapResult.error));
      }
      if (activitiesResult.error) {
        return errorResult('Failed to load activities for release', describeDbError(activitiesResult.error));
      }

      const activities = (activitiesResult.data ?? []).map((activity) => ({
        ...activity,
        tasks: (activity.tasks ?? []).map((task) => ({
          ...task,
          stories: (task.stories ?? []).map(toStoryPlanningRef),
        })),
      }));
      const releaseActivities = filterActivitiesForRelease(activities, release_id);
      const allStories = releaseActivities.flatMap((activity) =>
        (activity.tasks ?? []).flatMap((task) => task.stories ?? []),
      );

      return successResult({
        release: releaseResult.data,
        story_map: mapResult.data,
        activities: releaseActivities,
        summary: {
          storyCount: allStories.length,
          unfinishedCount: allStories.filter((story) => story.status !== 'done').length,
          storiesWithFigmaCount: allStories.filter((story) => story.has_figma_link).length,
          storiesMissingEdgeCasesCount: allStories.filter((story) => !story.has_edge_cases).length,
        },
        warnings: [
          ...(releaseResult.data?.context_markdown
            ? []
            : ['This release has no context markdown yet, so release-specific goals and guardrails are not captured.']),
        ],
      });
    }),
  );

  server.registerTool(
    'storymap_create',
    {
      title: 'Create Story Map',
      description:
        'Create a new story map container. team_id is optional when user has exactly one team. Call storymap_get afterward for full context.',
      inputSchema: createStoryMapToolSchema,
      outputSchema: successOutputSchema(storyMapRowSchema),
      annotations: createAnnotations,
    },
    withToolErrorBoundary('storymap_create', async (input) => {
      const supabase = getUserScopedClient();
      const resolvedTeam = await resolveAccessibleTeamId(supabase, user.id, input.team_id);
      if (!resolvedTeam.ok) return resolvedTeam.response;

      const { data, error } = await createStoryMap(supabase, {
        team_id: resolvedTeam.teamId,
        name: input.name,
        description: input.description,
        context_markdown: input.context_markdown,
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
        'Update one or more story map metadata fields. At least one change is required; re-read with storymap_get when continuing planning.',
      inputSchema: updateStoryMapToolSchema,
      outputSchema: successOutputSchema(storyMapRowSchema),
      annotations: updateAnnotations,
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
}
