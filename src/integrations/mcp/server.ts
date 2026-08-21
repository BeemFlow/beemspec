import {
  createProcessFlowEdgeSchema,
  createProcessFlowNodeSchema,
  createProcessFlowSchema,
  updateProcessFlowEdgeSchema,
  updateProcessFlowNodeSchema,
  updateProcessFlowSchema,
} from '@beemspec/processflow';
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
  buildProcessFlowFull,
  createProcessFlow,
  createProcessFlowEdge,
  createProcessFlowNode,
  deleteProcessFlow,
  deleteProcessFlowEdge,
  deleteProcessFlowNode,
  getProcessFlowMcpContext,
  listProcessFlows,
  updateProcessFlow,
  updateProcessFlowEdge,
  updateProcessFlowNode,
  validateProcessFlowById,
  validateProcessFlowGraph,
} from '@/processflow/service';
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
  getReleaseMcpContext,
  getStory,
  getStoryMapMcpContext,
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

function validateToolInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
): { ok: true; data: T } | { ok: false; result: ReturnType<typeof errorResult> } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      result: errorResult('Validation failed', parsed.error.flatten()),
    };
  }

  return { ok: true, data: parsed.data };
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

type StoryLike = {
  id: string;
  title: string;
  status: string;
  release_id: string | null;
  content?: {
    user_story?: string;
    acceptance_criteria?: string;
    edge_cases?: string | null;
    figma_link?: string | null;
  } | null;
};

type StoryPlanningRef = {
  id: string;
  title: string;
  status: string;
  release_id: string | null;
  has_figma_link: boolean;
  has_edge_cases: boolean;
};

type TaskLike = {
  id: string;
  name: string;
  stories?: StoryPlanningRef[];
  description?: string | null;
  sort_order?: number;
};

type ActivityLike = {
  id: string;
  name: string;
  description?: string | null;
  sort_order?: number;
  tasks?: TaskLike[];
};

type ReleaseLike = {
  id: string;
  name: string;
  description?: string | null;
  context_markdown?: string | null;
  sort_order?: number;
};

type PersonaLike = {
  id: string;
  name: string;
  goals?: string | null;
};

type ProcessFlowNodeLike = {
  id: string;
  type: string;
  data?: {
    label?: string;
    owner_role?: string | null;
    automation_opportunity?: string | null;
    frequency?: string | null;
    time_constraint?: string | null;
  } | null;
};

type ProcessFlowEdgeLike = {
  id: string;
  type: string;
  source_node_id: string;
  target_node_id: string;
  data?: {
    label?: string | null;
    condition?: string | null;
  } | null;
};

function toStoryPlanningRef(story: StoryLike): StoryPlanningRef {
  return {
    id: story.id,
    title: story.title,
    status: story.status,
    release_id: story.release_id,
    has_figma_link: Boolean(story.content?.figma_link),
    has_edge_cases: Boolean(story.content?.edge_cases),
  };
}

function buildPlanningLanes(releases: ReleaseLike[]) {
  return [
    { releaseId: null, releaseName: 'Backlog' },
    ...releases.map((release) => ({
      releaseId: release.id,
      releaseName: release.name,
    })),
  ];
}

function filterActivitiesForRelease(
  activities: Array<ActivityLike & { tasks?: Array<TaskLike & { stories?: StoryPlanningRef[] }> }>,
  releaseId: string,
) {
  return activities
    .map((activity) => ({
      ...activity,
      tasks: (activity.tasks ?? [])
        .map((task) => ({
          ...task,
          stories: (task.stories ?? []).filter((story) => story.release_id === releaseId),
        }))
        .filter((task) => (task.stories?.length ?? 0) > 0),
    }))
    .filter((activity) => (activity.tasks?.length ?? 0) > 0);
}

function buildStoryMapInsights(input: {
  map: { id: string; name: string; description?: string | null; context_markdown?: string | null };
  activities: ActivityLike[];
  releases: ReleaseLike[];
  personas: PersonaLike[];
}) {
  const allTasks = input.activities.flatMap((activity) => activity.tasks ?? []);
  const allStories = allTasks.flatMap((task) => task.stories ?? []);
  const backlogStories = allStories.filter((story) => story.release_id === null);
  const storiesWithFigma = allStories.filter((story) => story.has_figma_link);
  const storiesMissingEdgeCases = allStories.filter((story) => !story.has_edge_cases);
  const implementationNamedActivities = input.activities.filter((activity) =>
    /frontend|backend|api|database|infra|platform|ui/i.test(activity.name),
  );
  const implementationNamedTasks = allTasks.filter((task) =>
    /frontend|backend|api|database|schema|endpoint|ui/i.test(task.name),
  );
  const implementationHeavyStories = allStories.filter((story) =>
    /build|create|add|implement|refactor|wire|setup/i.test(story.title),
  );

  const statusCounts = allStories.reduce<Record<string, number>>((acc, story) => {
    acc[story.status] = (acc[story.status] ?? 0) + 1;
    return acc;
  }, {});

  const releaseSummaries = [
    {
      releaseId: null,
      releaseName: 'Backlog',
      storyCount: backlogStories.length,
      unfinishedCount: backlogStories.filter((story) => story.status !== 'done').length,
      storiesWithFigmaCount: backlogStories.filter((story) => story.has_figma_link).length,
    },
    ...input.releases.map((release) => {
      const stories = allStories.filter((story) => story.release_id === release.id);
      return {
        releaseId: release.id,
        releaseName: release.name,
        storyCount: stories.length,
        unfinishedCount: stories.filter((story) => story.status !== 'done').length,
        storiesWithFigmaCount: stories.filter((story) => story.has_figma_link).length,
        hasContext: Boolean(release.context_markdown),
      };
    }),
  ];

  const storyMappingWarnings: string[] = [];
  if (input.activities.length === 0)
    storyMappingWarnings.push('This map has no activities yet, so the user workflow backbone is not defined.');
  if (allTasks.length === 0)
    storyMappingWarnings.push('This map has no tasks yet, so activities are not broken into user tasks.');
  if (input.releases.length === 0)
    storyMappingWarnings.push(
      'This map has no named releases yet. Keep backlog-only planning if delivery slicing is still premature, but add releases once the team needs a concrete usable increment plan.',
    );
  if (input.releases.length > 0 && allStories.length > 0 && allStories.every((story) => story.release_id === null)) {
    storyMappingWarnings.push(
      'All stories are still in backlog even though releases exist. The release plan may be underspecified.',
    );
  }
  if (!input.map.context_markdown) {
    storyMappingWarnings.push(
      'This map has no context markdown yet, so product-level goals and guardrails are not captured in BeemSpec.',
    );
  }
  if (implementationNamedActivities.length > 0 || implementationNamedTasks.length > 0) {
    storyMappingWarnings.push(
      'Some activity or task names look implementation-oriented rather than user-workflow-oriented.',
    );
  }

  const recommendedNextActions: string[] = [];
  if (input.activities.length === 0) {
    recommendedNextActions.push('Create workflow-first activities before adding more delivery detail.');
  }
  if (allTasks.length > 0 && allStories.length === 0) {
    recommendedNextActions.push('Add thin end-to-end stories under the existing tasks so the map becomes actionable.');
  }
  if (input.releases.length > 0) {
    recommendedNextActions.push(
      'Choose a target release, then call release_get or inspect unfinished stories in that lane before implementation.',
    );
  } else {
    recommendedNextActions.push(
      'Keep stories in backlog until you have enough clarity to define a usable release slice.',
    );
  }
  if (storiesWithFigma.length > 0) {
    recommendedNextActions.push(
      'For stories with Figma links, fetch design context through the Figma MCP server before UI implementation.',
    );
  }
  if (input.personas.length > 0) {
    recommendedNextActions.push(
      'Use persona goals to refine acceptance criteria and release choice when they materially affect the workflow.',
    );
  }

  const topRiskFlags: string[] = [];
  if (implementationNamedActivities.length > 0 || implementationNamedTasks.length > 0) {
    topRiskFlags.push('Map structure may reflect implementation breakdown instead of user workflow.');
  }
  if (implementationHeavyStories.length > 0) {
    topRiskFlags.push('Some story titles may describe implementation tasks rather than user-visible outcomes.');
  }
  if (storiesMissingEdgeCases.length > 0) {
    topRiskFlags.push('Some stories omit edge cases, which may hide implementation risk.');
  }
  if (input.releases.some((release) => !release.context_markdown)) {
    topRiskFlags.push(
      'One or more releases lack context markdown, which may weaken release-level scope and priority decisions.',
    );
  }

  return {
    map_summary: {
      storyMapId: input.map.id,
      storyMapName: input.map.name,
      activityCount: input.activities.length,
      taskCount: allTasks.length,
      releaseCount: input.releases.length,
      personaCount: input.personas.length,
      storyCount: allStories.length,
      backlogStoryCount: backlogStories.length,
      storiesWithFigmaCount: storiesWithFigma.length,
      storiesMissingEdgeCasesCount: storiesMissingEdgeCases.length,
      statusCounts,
    },
    release_summaries: releaseSummaries,
    persona_summary: input.personas.map((persona) => ({
      personaId: persona.id,
      name: persona.name,
      goals: persona.goals ?? null,
    })),
    top_risk_flags: topRiskFlags.slice(0, 3),
    story_mapping_warnings: storyMappingWarnings,
    recommended_next_actions: recommendedNextActions.slice(0, 3),
  };
}

function buildMutationGuidance(input: {
  entityType: 'story' | 'task' | 'activity' | 'release' | 'storymap';
  operation: 'create' | 'update' | 'move' | 'reorder';
  ids?: Record<string, string | null | undefined>;
  entity?: Record<string, unknown> | null;
}) {
  const nextRecommendedReads: string[] = [];
  const verificationHints: string[] = [];
  const warnings: string[] = [];

  if (input.entityType === 'story') {
    if (input.operation === 'create' && input.ids?.story_id)
      nextRecommendedReads.push(
        'Call story_context_get(story_id) only if this story is the next one you plan to implement or refine deeply.',
      );
    if (input.operation === 'move' || input.operation === 'reorder') {
      nextRecommendedReads.push(
        'Call storymap_get(story_map_id) after the current structural mutation batch to verify release coherence and ordering.',
      );
    }
    verificationHints.push(
      'Confirm the story still reads as a thin user-visible slice with testable acceptance criteria.',
    );
    verificationHints.push(
      'Confirm the story is in the correct task and release cell, including backlog vs named release.',
    );

    const content = typeof input.entity?.content === 'object' && input.entity?.content ? input.entity.content : null;
    const figmaLink = content && 'figma_link' in content ? Reflect.get(content, 'figma_link') : null;
    const edgeCases = content && 'edge_cases' in content ? Reflect.get(content, 'edge_cases') : null;

    if (!edgeCases) {
      warnings.push('No edge cases are captured for this story yet; add them if failure modes matter.');
    }
    if (typeof figmaLink === 'string' && figmaLink.length > 0) {
      verificationHints.push(
        'A Figma link is present. If Figma MCP is connected, fetch design context before UI implementation.',
      );
    }
  }

  if (input.entityType === 'task' || input.entityType === 'activity') {
    if (input.operation === 'create' || input.operation === 'move' || input.operation === 'reorder') {
      nextRecommendedReads.push(
        'Call storymap_get(story_map_id) after the current structural mutation batch to verify workflow order left-to-right.',
      );
    }
    verificationHints.push(
      'Confirm names describe user workflow steps rather than internal components or team ownership.',
    );
  }

  if (input.entityType === 'release') {
    if (input.operation === 'create' || input.operation === 'reorder') {
      nextRecommendedReads.push(
        'Call storymap_get(story_map_id) after the current structural mutation batch to verify release ordering and story placement.',
      );
    }
    verificationHints.push(
      'Confirm the release still represents a usable increment rather than an internal implementation phase.',
    );
  }

  if (input.operation === 'move' || input.operation === 'reorder') {
    verificationHints.push('Verify ordering in the destination lane after this structural change.');
  }

  return {
    next_recommended_reads: nextRecommendedReads,
    verification_hints: verificationHints,
    warnings,
  };
}

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

async function resolveProcessFlowIdByName(
  supabase: Supabase,
  processFlowName: string,
  teamId?: string,
): Promise<{ ok: true; processFlowId: string } | { ok: false; response: ReturnType<typeof errorResult> }> {
  let query = supabase.from('process_flows').select('id, name, team_id').eq('name', processFlowName);
  if (teamId) query = query.eq('team_id', teamId);

  const { data, error } = await query;
  if (error) {
    return { ok: false, response: errorResult('Failed to resolve process flow by name', describeDbError(error)) };
  }

  const matches = data ?? [];
  if (matches.length === 0) {
    return { ok: false, response: errorResult('Process flow not found by name') };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      response: errorResult('Multiple process flows matched this name. Pass process_flow_id or team_id.', {
        matches,
      }),
    };
  }

  return { ok: true, processFlowId: matches[0].id as string };
}

function buildProcessFlowAgentInsights(nodes: ProcessFlowNodeLike[], edges: ProcessFlowEdgeLike[]) {
  const nodeCountsByType = nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.type] = (acc[node.type] ?? 0) + 1;
    return acc;
  }, {});

  const automationCandidates = nodes.filter((node) => node.data?.automation_opportunity?.trim()).length;
  const ownershipTaggedNodes = nodes.filter((node) => node.data?.owner_role?.trim()).length;
  const frequencyTaggedNodes = nodes.filter((node) => node.data?.frequency?.trim()).length;
  const timeConstrainedNodes = nodes.filter((node) => node.data?.time_constraint?.trim()).length;
  const labeledEdges = edges.filter((edge) => edge.data?.label?.trim()).length;
  const conditionedEdges = edges.filter((edge) => edge.data?.condition?.trim()).length;

  return {
    nodeCountsByType,
    edgeCount: edges.length,
    automationCandidates,
    ownershipTaggedNodes,
    frequencyTaggedNodes,
    timeConstrainedNodes,
    labeledEdges,
    conditionedEdges,
  };
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
    'processflow_workflow_guide',
    {
      title: 'Process Flow Workflow Guide',
      description:
        'CALL THIS FIRST BEFORE TOUCHING THE PROCESS FLOW. Read-first guide for agents translating user input into an operational flow.',
      annotations: readAnnotations,
    },
    withToolErrorBoundary('processflow_workflow_guide', async () => {
      return successResult({
        objective:
          'Use BeemSpec as the structured source of truth for operational process modeling. Build clear flows from messy user input with minimal redundant calls and minimal unsafe inference.',
        operating_mode: [
          'Act as an operations-minded modeling partner, not just a note taker.',
          'Read this guide first, then fetch only the flow context needed for the current decision.',
          'Prefer representing observed operational reality before proposing automation or redesign.',
          'Do not invent systems, approvals, branches, or ownership when the source material does not support them.',
          'When context is missing, prefer one focused clarification or one explicit assumption over speculative process design.',
        ],
        tool_sequence: [
          '1) Call processflow_list(team_id?) to discover candidate flows when the target is unclear.',
          '2) Call processflow_get(process_flow_id or process_flow_name) before structural edits.',
          '3) Create or update nodes and edges in focused batches of related changes.',
          '4) Call processflow_validation_get(process_flow_id) to inspect deterministic warnings after major changes.',
          '5) Re-read with processflow_get(process_flow_id) only after material structural changes or when flow context has changed.',
        ],
        tool_usage_rules: [
          'Call team_list when team context is unknown or the user may have access to multiple teams.',
          'Use processflow_get as the canonical read for both reasoning and verification.',
          'Use node create/update/delete tools for explicit graph changes; use edge tools for connection changes.',
          'Use processflow_validation_get to surface structural warnings, not to replace reasoning about the business process.',
          'Use processflow context markdown for durable process context such as scope, assumptions, known constraints, source interviews, and audit notes.',
          'Avoid redundant reads when the current flow context already answers the next decision.',
        ],
        clarification_policy: [
          'Ask the user questions only when ambiguity would materially change the flow structure, decision logic, ownership, or automation recommendation.',
          'Do all non-blocked work first before asking clarifying questions.',
          'Bundle clarifying questions into one focused round instead of many small follow-ups.',
          'Recommend a reasonable default when asking a question and explain what would change based on the answer.',
        ],
        safe_vs_unsafe_inference: {
          safe_to_infer: [
            'Minor node wording cleanup that preserves the same operational meaning.',
            'Simple edge labels for clearly described yes/no style decisions when the transcript explicitly implies them.',
            'Reasonable frequency estimates when the interviewee describes volume qualitatively (e.g., "we do this constantly" can be captured as "high volume, multiple times per day").',
            'Reasonable layout choices that do not alter the process semantics.',
          ],
          unsafe_to_infer: [
            'Inventing systems, teams, approvals, or exception paths that the source material never mentioned.',
            'Rewriting the real-world process into an optimized future process without making that transition explicit to the user.',
            'Assuming automation feasibility without evidence about tools, systems, or constraints.',
            'Precise numeric frequency or duration values when the source material only gives vague qualitative descriptions.',
            'Time constraints or SLAs that were not explicitly stated in the source material — do not invent compliance requirements.',
          ],
        },
        process_modeling_principles: [
          'Use step nodes for concrete actions, decision nodes for branching logic, actor/system nodes when ownership or system participation matters, and note nodes only for supporting context.',
          'Keep labels short, operational, and specific.',
          'Prefer one node per meaningful operational step rather than large paragraphs inside nodes.',
          'Use handoff edges when work meaningfully changes owner, team, or system context.',
          'Capture frequency, estimated duration, and time constraints when the source material mentions them — these are high-signal for automation prioritization. Frequency times duration equals operational cost; time constraints indicate urgency and compliance pressure. Both matter for automation ROI but answer different questions.',
          'Use the condition field on decision outbound edges to record the actual branch logic separately from the display label. The label is what humans read on the diagram; the condition is the rule the automation agent needs to generate workflow logic.',
          'Treat disconnected nodes as a warning sign unless they are intentionally exploratory notes.',
        ],
      });
    }),
  );

  server.registerTool(
    'processflow_list',
    {
      title: 'List Process Flows',
      description:
        'Starting point. List process flows for a team. team_id is optional when the user has exactly one team.',
      inputSchema: {
        team_id: z.string().uuid().optional().describe('Team UUID (optional for single-team users)'),
      },
      annotations: readAnnotations,
    },
    withToolErrorBoundary('processflow_list', async ({ team_id }) => {
      const supabase = getUserScopedClient();
      const resolvedTeam = await resolveAccessibleTeamId(supabase, user.id, team_id);
      if (!resolvedTeam.ok) return resolvedTeam.response;

      const { data, error } = await listProcessFlows(supabase, resolvedTeam.teamId);
      if (error) return errorResult('Failed to load process flows', describeDbError(error));

      return successResult(data ?? []);
    }),
  );

  server.registerTool(
    'processflow_get',
    {
      title: 'Get Process Flow',
      description:
        'Primary context loader. Pass process_flow_id directly, or pass process_flow_name (and optional team_id) for resolution.',
      inputSchema: {
        process_flow_id: z.string().uuid().optional().describe('Process flow UUID'),
        process_flow_name: z.string().min(1).max(200).optional().describe('Process flow name'),
        team_id: z.string().uuid().optional().describe('Team UUID for disambiguating name matches'),
      },
      annotations: readAnnotations,
    },
    withToolErrorBoundary('processflow_get', async ({ process_flow_id, process_flow_name, team_id }) => {
      const supabase = getUserScopedClient();
      let resolvedProcessFlowId = process_flow_id;

      if (!resolvedProcessFlowId && process_flow_name) {
        const resolved = await resolveProcessFlowIdByName(supabase, process_flow_name, team_id);
        if (!resolved.ok) return resolved.response;
        resolvedProcessFlowId = resolved.processFlowId;
      }

      if (!resolvedProcessFlowId) {
        return errorResult('Provide process_flow_id or process_flow_name');
      }

      const { flowResult, nodesResult, edgesResult } = await getProcessFlowMcpContext(supabase, resolvedProcessFlowId);
      if (flowResult.error || !flowResult.data) {
        if (isNotFound(flowResult.error)) return errorResult('Process flow not found');
        return errorResult('Failed to load process flow', describeDbError(flowResult.error));
      }
      if (nodesResult.error)
        return errorResult('Failed to load process flow nodes', describeDbError(nodesResult.error));
      if (edgesResult.error)
        return errorResult('Failed to load process flow edges', describeDbError(edgesResult.error));

      const fullFlow = buildProcessFlowFull(flowResult.data, nodesResult.data ?? [], edgesResult.data ?? []);
      const validation = validateProcessFlowGraph(fullFlow);

      return successResult({
        ...fullFlow,
        agent_insights: buildProcessFlowAgentInsights(nodesResult.data ?? [], edgesResult.data ?? []),
        validation,
      });
    }),
  );

  server.registerTool(
    'processflow_validation_get',
    {
      title: 'Validate Process Flow',
      description: 'Return deterministic structural warnings for a process flow.',
      inputSchema: {
        process_flow_id: z.string().uuid().describe('Process flow UUID'),
      },
      annotations: readAnnotations,
    },
    withToolErrorBoundary('processflow_validation_get', async ({ process_flow_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await validateProcessFlowById(supabase, process_flow_id);
      if (error) {
        if (isNotFound(error)) return errorResult('Process flow not found');
        return errorResult('Failed to validate process flow', describeDbError(error));
      }

      return successResult(data);
    }),
  );

  server.registerTool(
    'processflow_create',
    {
      title: 'Create Process Flow',
      description: 'Create a new process flow container. team_id is optional when the user has exactly one team.',
      inputSchema: {
        team_id: z.string().uuid().optional().describe('Team UUID (optional for single-team users)'),
        name: createProcessFlowSchema.shape.name,
        description: createProcessFlowSchema.shape.description,
        context_markdown: createProcessFlowSchema.shape.context_markdown,
        viewport: createProcessFlowSchema.shape.viewport,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('processflow_create', async (input) => {
      const supabase = getUserScopedClient();
      const resolvedTeam = await resolveAccessibleTeamId(supabase, user.id, input.team_id);
      if (!resolvedTeam.ok) return resolvedTeam.response;

      const { data, error } = await createProcessFlow(supabase, {
        team_id: resolvedTeam.teamId,
        name: input.name,
        description: input.description,
        context_markdown: input.context_markdown,
        viewport: input.viewport,
      });
      if (error) return errorResult('Failed to create process flow', describeDbError(error));

      return successResult(data);
    }),
  );

  server.registerTool(
    'processflow_update',
    {
      title: 'Update Process Flow',
      description: 'Update process flow metadata such as name, description, context, or viewport.',
      inputSchema: {
        process_flow_id: z.string().uuid(),
        ...updateProcessFlowSchema.shape,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('processflow_update', async ({ process_flow_id, ...changes }) => {
      const validation = validateToolInput(updateProcessFlowSchema, changes);
      if (!validation.ok) return validation.result;

      const supabase = getUserScopedClient();
      const { data, error } = await updateProcessFlow(supabase, process_flow_id, validation.data);
      if (error) {
        if (isNotFound(error)) return errorResult('Process flow not found');
        return errorResult('Failed to update process flow', describeDbError(error));
      }

      return successResult(data);
    }),
  );

  server.registerTool(
    'processflow_delete',
    {
      title: 'Delete Process Flow',
      description: 'Destructive. Deletes a process flow and all nested nodes and edges.',
      inputSchema: {
        process_flow_id: z.string().uuid(),
      },
      annotations: destructiveAnnotations,
    },
    withToolErrorBoundary('processflow_delete', async ({ process_flow_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await deleteProcessFlow(supabase, process_flow_id);
      if (error) {
        if (isNotFound(error)) return errorResult('Process flow not found');
        return errorResult('Failed to delete process flow', describeDbError(error));
      }

      return successResult({ deleted: data });
    }),
  );

  server.registerTool(
    'processflow_node_create',
    {
      title: 'Create Process Flow Node',
      description:
        'Create a node in a process flow. Node data fields include label, owner_role, systems, inputs, outputs, pain_points, notes, automation_opportunity, frequency, estimated_duration, and time_constraint.',
      inputSchema: createProcessFlowNodeSchema.shape,
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('processflow_node_create', async (input) => {
      const supabase = getUserScopedClient();
      const { data, error } = await createProcessFlowNode(supabase, input);
      if (error) return errorResult('Failed to create process flow node', describeDbError(error));

      return successResult(data);
    }),
  );

  server.registerTool(
    'processflow_node_update',
    {
      title: 'Update Process Flow Node',
      description:
        'Update a process flow node. Use this for label, ownership, metadata, position, or node data changes including systems, inputs, outputs, pain_points, notes, automation_opportunity, frequency, estimated_duration, and time_constraint.',
      inputSchema: {
        process_flow_id: z.string().uuid(),
        node_id: z.string().uuid(),
        ...updateProcessFlowNodeSchema.shape,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('processflow_node_update', async ({ process_flow_id, node_id, ...changes }) => {
      const validation = validateToolInput(updateProcessFlowNodeSchema, changes);
      if (!validation.ok) return validation.result;

      const supabase = getUserScopedClient();
      const { data, error } = await updateProcessFlowNode(supabase, process_flow_id, node_id, validation.data);
      if (error) {
        if (isNotFound(error)) return errorResult('Process flow node not found');
        return errorResult('Failed to update process flow node', describeDbError(error));
      }

      return successResult(data);
    }),
  );

  server.registerTool(
    'processflow_node_delete',
    {
      title: 'Delete Process Flow Node',
      description: 'Destructive. Deletes a process flow node and any connected edges removed by cascade.',
      inputSchema: {
        process_flow_id: z.string().uuid(),
        node_id: z.string().uuid(),
      },
      annotations: destructiveAnnotations,
    },
    withToolErrorBoundary('processflow_node_delete', async ({ process_flow_id, node_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await deleteProcessFlowNode(supabase, process_flow_id, node_id);
      if (error) {
        if (isNotFound(error)) return errorResult('Process flow node not found');
        return errorResult('Failed to delete process flow node', describeDbError(error));
      }

      return successResult({ deleted: data });
    }),
  );

  server.registerTool(
    'processflow_edge_create',
    {
      title: 'Create Process Flow Edge',
      description: 'Create an edge between two nodes in a process flow. Edge data fields include label and condition.',
      inputSchema: createProcessFlowEdgeSchema.shape,
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('processflow_edge_create', async (input) => {
      const supabase = getUserScopedClient();
      const { data, error } = await createProcessFlowEdge(supabase, input);
      if (error) return errorResult('Failed to create process flow edge', describeDbError(error));

      return successResult(data);
    }),
  );

  server.registerTool(
    'processflow_edge_update',
    {
      title: 'Update Process Flow Edge',
      description:
        'Update a process flow edge. Use this for type changes or edge data updates including label and condition.',
      inputSchema: {
        process_flow_id: z.string().uuid(),
        edge_id: z.string().uuid(),
        ...updateProcessFlowEdgeSchema.shape,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('processflow_edge_update', async ({ process_flow_id, edge_id, ...changes }) => {
      const validation = validateToolInput(updateProcessFlowEdgeSchema, changes);
      if (!validation.ok) return validation.result;

      const supabase = getUserScopedClient();
      const { data, error } = await updateProcessFlowEdge(supabase, process_flow_id, edge_id, validation.data);
      if (error) {
        if (isNotFound(error)) return errorResult('Process flow edge not found');
        return errorResult('Failed to update process flow edge', describeDbError(error));
      }

      return successResult(data);
    }),
  );

  server.registerTool(
    'processflow_edge_delete',
    {
      title: 'Delete Process Flow Edge',
      description: 'Destructive. Deletes a process flow edge.',
      inputSchema: {
        process_flow_id: z.string().uuid(),
        edge_id: z.string().uuid(),
      },
      annotations: destructiveAnnotations,
    },
    withToolErrorBoundary('processflow_edge_delete', async ({ process_flow_id, edge_id }) => {
      const supabase = getUserScopedClient();
      const { data, error } = await deleteProcessFlowEdge(supabase, process_flow_id, edge_id);
      if (error) {
        if (isNotFound(error)) return errorResult('Process flow edge not found');
        return errorResult('Failed to delete process flow edge', describeDbError(error));
      }

      return successResult({ deleted: data });
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
      return successResult({
        ...data,
        agent_guidance: buildMutationGuidance({
          entityType: 'activity',
          operation: 'create',
          entity: data,
        }),
      });
    }),
  );

  server.registerTool(
    'activity_update',
    {
      title: 'Update Activity',
      description: 'Update activity fields like name or description. Use reorder tools for position changes.',
      inputSchema: {
        activity_id: z.string().uuid(),
        ...updateActivitySchema.shape,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('activity_update', async ({ activity_id, ...changes }) => {
      const validation = validateToolInput(updateActivitySchema, changes);
      if (!validation.ok) return validation.result;

      const supabase = getUserScopedClient();
      const { data, error } = await updateActivity(supabase, activity_id, validation.data);

      if (error) {
        if (isNotFound(error)) return errorResult('Activity not found');
        return errorResult('Failed to update activity', describeDbError(error));
      }
      return successResult({
        ...data,
        agent_guidance: buildMutationGuidance({
          entityType: 'activity',
          operation: 'update',
          entity: data,
        }),
      });
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
      return successResult({
        reordered: order.length,
        agent_guidance: buildMutationGuidance({
          entityType: 'activity',
          operation: 'reorder',
          ids: { story_map_id },
        }),
      });
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
      return successResult({
        ...data,
        agent_guidance: buildMutationGuidance({
          entityType: 'task',
          operation: 'create',
          entity: data,
        }),
      });
    }),
  );

  server.registerTool(
    'task_update',
    {
      title: 'Update Task',
      description: 'Update task fields like name or description. Use move/reorder tools for position changes.',
      inputSchema: {
        task_id: z.string().uuid(),
        ...updateTaskSchema.shape,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('task_update', async ({ task_id, ...changes }) => {
      const validation = validateToolInput(updateTaskSchema, changes);
      if (!validation.ok) return validation.result;

      const supabase = getUserScopedClient();
      const { data, error } = await updateTask(supabase, task_id, validation.data);

      if (error) {
        if (isNotFound(error)) return errorResult('Task not found');
        return errorResult('Failed to update task', describeDbError(error));
      }
      return successResult({
        ...data,
        agent_guidance: buildMutationGuidance({
          entityType: 'task',
          operation: 'update',
          entity: data,
        }),
      });
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
      return successResult({
        reordered: order.length,
        agent_guidance: buildMutationGuidance({
          entityType: 'task',
          operation: 'reorder',
          ids: { activity_id },
        }),
      });
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
      return successResult({
        moved: task_id,
        target_activity_id: input.target_activity_id,
        target_order_size: input.target_order.length,
        agent_guidance: buildMutationGuidance({
          entityType: 'task',
          operation: 'move',
          ids: { task_id, target_activity_id: input.target_activity_id },
        }),
      });
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
      return successResult({
        ...data,
        agent_guidance: buildMutationGuidance({
          entityType: 'release',
          operation: 'create',
          entity: data,
        }),
      });
    }),
  );

  server.registerTool(
    'release_update',
    {
      title: 'Update Release',
      description: 'Update release fields like name or description. Use reorder tools for position changes.',
      inputSchema: {
        release_id: z.string().uuid(),
        ...updateReleaseSchema.shape,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('release_update', async ({ release_id, ...changes }) => {
      const validation = validateToolInput(updateReleaseSchema, changes);
      if (!validation.ok) return validation.result;

      const supabase = getUserScopedClient();
      const { data, error } = await updateRelease(supabase, release_id, validation.data);

      if (error) {
        if (isNotFound(error)) return errorResult('Release not found');
        return errorResult('Failed to update release', describeDbError(error));
      }
      return successResult({
        ...data,
        agent_guidance: buildMutationGuidance({
          entityType: 'release',
          operation: 'update',
          entity: data,
        }),
      });
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
      return successResult({
        reordered: order.length,
        agent_guidance: buildMutationGuidance({
          entityType: 'release',
          operation: 'reorder',
          ids: { story_map_id },
        }),
      });
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
      const context = await getStoryContext(supabase, story_id);
      return successResult({
        ...data,
        agent_context: context,
      });
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
      return successResult({
        ...data,
        agent_guidance: buildMutationGuidance({
          entityType: 'story',
          operation: 'create',
          ids: { story_id: data.id, task_id: data.task_id, release_id: data.release_id },
          entity: data,
        }),
      });
    }),
  );

  server.registerTool(
    'story_update',
    {
      title: 'Update Story',
      description:
        'Update story fields like title, status, or content. Use story_move for task/release placement changes.',
      inputSchema: {
        story_id: z.string().uuid(),
        ...updateStorySchema.shape,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('story_update', async ({ story_id, ...changes }) => {
      const validation = validateToolInput(updateStorySchema, changes);
      if (!validation.ok) return validation.result;

      const supabase = getUserScopedClient();
      const { data, error } = await updateStory(supabase, story_id, validation.data);

      if (error) {
        if (isNotFound(error)) return errorResult('Story not found');
        return errorResult('Failed to update story', describeDbError(error));
      }
      return successResult({
        ...data,
        agent_guidance: buildMutationGuidance({
          entityType: 'story',
          operation: 'update',
          ids: { story_id: data.id, task_id: data.task_id, release_id: data.release_id },
          entity: data,
        }),
      });
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
      return successResult({
        reordered: order.length,
        task_id,
        release_id,
        agent_guidance: buildMutationGuidance({
          entityType: 'story',
          operation: 'reorder',
          ids: { task_id, release_id },
        }),
      });
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
      return successResult({
        moved: story_id,
        target_task_id: input.target_task_id,
        target_release_id: input.target_release_id,
        target_order_size: input.target_order.length,
        agent_guidance: buildMutationGuidance({
          entityType: 'story',
          operation: 'move',
          ids: { story_id, task_id: input.target_task_id, release_id: input.target_release_id },
        }),
      });
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
      description: 'Update persona fields like name, description, or goals.',
      inputSchema: {
        persona_id: z.string().uuid(),
        ...updatePersonaSchema.shape,
      },
      annotations: mutateAnnotations,
    },
    withToolErrorBoundary('persona_update', async ({ persona_id, ...changes }) => {
      const validation = validateToolInput(updatePersonaSchema, changes);
      if (!validation.ok) return validation.result;

      const supabase = getUserScopedClient();
      const { data, error } = await updatePersona(supabase, persona_id, validation.data);

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
        'Full implementation context for one story, including workflow placement, personas, and Figma hints when present. Use after selecting a story via storymap_get.',
      inputSchema: {
        story_id: z.string().uuid().describe('BeemSpec story UUID'),
      },
      annotations: readAnnotations,
    },
    withToolErrorBoundary('story_context_get', async ({ story_id }) => {
      const supabase = getUserScopedClient();
      const context = await getStoryContext(supabase, story_id);

      if (!context) {
        return errorResult('Story not found');
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
