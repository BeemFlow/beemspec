import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createStoryMapSchema, updateStoryMapSchema } from '@/domain/story-map';
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
import {
  describeDbError,
  errorResult,
  isNotFound,
  mutateAnnotations,
  readAnnotations,
  resolveAccessibleTeamId,
  resolveStoryMapIdByName,
  successResult,
  withToolErrorBoundary,
} from '../tool-support';

export function registerStoryMapTools(server: McpServer, supabase: Supabase, user: AuthenticatedUser): void {
  const getUserScopedClient = () => supabase;
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
        objective:
          'Use BeemSpec as the planning source of truth, act like an expert product-minded implementation partner, and make careful decisions with minimal redundant MCP calls or unnecessary user interruptions.',
        operating_mode: [
          'Act as a product-minded implementation partner, not just a code generator.',
          'Read this guide first, then fetch only the map or story context needed for the current decision.',
          'Preserve the intent of the story map, release slice, and selected story while making local implementation decisions.',
          'Do not invent product decisions when the map, story, release, personas, or linked design should answer them.',
          'When context is missing, prefer a focused clarification or explicit assumption over a risky product decision.',
        ],
        tool_sequence: [
          '1) Call storymap_list(team_id?) to discover candidate maps (team_id optional when user has one team).',
          '2) Call storymap_get(story_map_id) to load story map context, backbone structure, release list, and lightweight story references.',
          '3) Call release_get(release_id) when you need release-level context, release-scope review, or the stories inside one release.',
          '4) If implementing or deeply refining one story, call story_context_get(story_id) for story-level coding and design context.',
          '5) Perform targeted create/update/move/reorder/delete operations as needed.',
          '6) Re-read with storymap_get(story_map_id) only after a structural mutation batch or when release planning context has changed.',
        ],
        tool_usage_rules: [
          'Call team_list when team context is unknown or the user may have access to multiple teams.',
          'Call storymap_get before structural edits or release planning so you can preserve activity, task, story, and release ordering.',
          'Use release_get when a release has its own context, goals, or review questions and you do not need full story context for every story.',
          'Use story_update for content or status changes; use story_move/task_move for placement changes; use *_reorder only when you already know the full ordered ID list.',
          'Use story_context_get only when one story needs full implementation context, including workflow placement, personas, map context, release context, and any Figma link.',
          'Avoid redundant reads: if you already have the needed story or map context in the current session, continue working instead of re-fetching it.',
          'Treat story map context markdown as the place for durable product context such as higher-level goals, business context, success criteria, key metrics, and prioritization guardrails.',
          'Treat release context markdown as the place for release-specific goals, success criteria, scope guidance, business focus, and technical constraints that apply across stories in that release.',
          'Treat inferred user stories, acceptance criteria, personas, and release plans as drafts unless the user explicitly asks you to synthesize them.',
        ],
        clarification_policy: [
          'Ask the user questions only when ambiguity would materially change implementation, acceptance criteria, release choice, or user-visible behavior.',
          'Do all non-blocked work first before asking clarifying questions.',
          'Bundle clarifying questions into one focused round instead of asking multiple tiny follow-ups.',
          'Ask at most one bundled clarification round unless new blockers appear later.',
          'When asking a question, recommend a reasonable default and explain what would change based on the answer.',
          'Do not ask for information that is already available in the story map, story context, personas, release lane, or linked Figma design.',
          'When durable product or release guidance is missing, suggest capturing it in story map or release context markdown instead of repeating it ad hoc in chat.',
        ],
        safe_vs_unsafe_inference: {
          safe_to_infer: [
            'Reasonable implementation details that do not change the user-visible behavior or product scope.',
            'Small coding decisions that follow established repository conventions, existing architecture, or linked design patterns.',
            'Thin sequencing choices inside an already-defined story when acceptance criteria remain satisfied.',
          ],
          unsafe_to_infer: [
            'New product scope, success criteria, or release commitments that are not supported by the map.',
            'User-visible behavior choices when the story, acceptance criteria, or design could lead to meaningfully different outcomes.',
            'Missing UX decisions when a Figma link exists or when a UI choice could affect the workflow, accessibility, or acceptance criteria.',
            'Architectural or data-model changes that create irreversible constraints without clear story support.',
          ],
        },
        story_mapping_principles: [
          'Keep the backbone as user workflow steps in narrative order, not engineering components or team ownership lanes.',
          'Place tasks under activities as user tasks, then slice stories into thin end-to-end increments that deliver observable value.',
          'Use releases as usable learning increments or backlog separation, not internal implementation phases.',
          'Keep personas lightweight and only use them when they materially change workflow, story selection, or acceptance criteria.',
          'If activity or task names read like frontend/backend/database/components, treat that as a warning that the map may be organized around implementation structure instead of user workflow.',
          'If a story title sounds like an implementation task rather than a user-visible outcome, preserve the data but flag the issue to the user before broadening execution.',
          'If a story appears too broad, prefer suggesting a thinner end-to-end slice rather than implementing a wide batch of loosely related work.',
          'If releases look like internal phases instead of usable increments, preserve the current structure unless asked to reorganize, but call out the planning risk.',
        ],
        story_quality_principles: [
          'Title expresses user-visible value or outcome, not just an implementation task.',
          'User story explains who wants what and why.',
          'Acceptance criteria are specific, observable, and testable.',
          'Story, release, and map-level context should make it clear how the work supports broader goals, success criteria, or business priorities when that context matters.',
          'Edge cases and technical guidelines are included when they materially reduce ambiguity or implementation risk.',
          'If a story lacks enough context to tell what user-visible outcome should change, treat it as underspecified.',
          'If the story is implementation-ready, proceed decisively rather than asking the user to reconfirm obvious next steps.',
        ],
        implementation_principles: [
          'release_id = null means backlog. Do not invent releases prematurely when backlog is the more honest state.',
          'When building an entire release, use release_get to inspect release context and the stories in that release before choosing implementation order.',
          'Favor a walking skeleton or critical-path release slice before adding breadth, polish, or component completeness.',
          'Prefer implementing the minimum set of stories that makes the release usable, learnable, or testable in the hands of a user.',
          'Check nearby stories in the same release before coding so you preserve the release intent instead of optimizing one story in isolation.',
          'If the release contains both critical-path and polish stories, implement the critical-path stories first unless the user explicitly chooses otherwise.',
          'If a Figma link is present, treat it as required design context for UI work.',
          'If the acceptance criteria are vague, non-observable, or only describe implementation, pause and clarify before committing to broad execution.',
          'If the story includes meaningful risk areas such as auth, payments, destructive actions, migrations, or permissions, missing edge cases should raise caution.',
          'When a story includes a figma_link, prefer using the Figma MCP server if it is connected to the current agent session.',
          'Use figma_get_design_context first when possible, then figma_get_screenshot if a visual check is still needed.',
          'Do not invent UI details that the linked design can answer directly.',
          'Use story_context_get for the selected story before implementation when the story is the main unit of work.',
          'Implement carefully and thoughtfully: satisfy the story, preserve release intent, and avoid accidental scope expansion.',
          'Keep implementation aligned to the acceptance criteria and avoid solving adjacent problems unless they are required to satisfy the story.',
          'Prefer changes that are easy to verify, easy to explain, and easy to adjust if the story evolves.',
          'When technical guidelines exist, treat them as constraints unless they clearly conflict with repository reality and need user clarification.',
          'When UI work is involved and design context is incomplete, be conservative and explicit about assumptions.',
        ],
        update_policy: [
          'If you refine scope, acceptance criteria, or story wording during discussion, update the relevant BeemSpec entities so the map stays trustworthy.',
          'If you create an architecture document or other synthesized planning artifact from the story map and new decisions are made, ask the user whether those decisions should be reflected back into BeemSpec before the session ends.',
          'When asking about BeemSpec follow-through after decisions, explicitly check whether release context, story context, acceptance criteria, edge cases, or technical guidelines should be updated.',
          'If the conversation reveals durable product goals, release goals, metrics, success criteria, or business context that should guide future work, suggest capturing them in story map or release context markdown.',
          'Use move and reorder operations instead of delete-and-recreate when preserving history and ordering matters.',
          'Keep newly synthesized planning content clearly framed as draft unless the user asked you to formalize it.',
        ],
        anti_patterns: [
          'Do not behave like a passive code executor that ignores release intent, personas, or workflow context.',
          'Do not ask the user to reconfirm obvious next steps when the map already provides enough direction.',
          'Do not reorganize a story map around frontend/backend/database components.',
          'Do not create giant unsliced stories when thinner end-to-end slices are possible.',
          'Do not delete and recreate entities when move/update preserves history and ordering more safely.',
          'Do not treat personas as decorative metadata if they do not change decisions.',
          'Do not invent product decisions or UI details when BeemSpec context or linked design should answer them.',
        ],
        verification_checklist: [
          'Backbone still reads as a coherent user journey from left to right.',
          'Task ordering within each activity still matches workflow order.',
          'Stories are in the correct task and release cell, including backlog vs named release.',
          'Release rows still represent usable increments rather than internal implementation phases.',
          'Any story with a figma_link has enough design context for implementation.',
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
      inputSchema: {
        release_id: z.string().uuid().describe('Release UUID'),
      },
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
      inputSchema: {
        team_id: z.string().uuid().optional().describe('Team UUID (optional for single-team users)'),
        name: createStoryMapSchema.shape.name,
        description: createStoryMapSchema.shape.description,
        context_markdown: createStoryMapSchema.shape.context_markdown,
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
}
