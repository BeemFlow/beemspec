import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createProcessFlowEdgeSchema,
  createProcessFlowNodeSchema,
  createProcessFlowSchema,
  updateProcessFlowEdgeSchema,
  updateProcessFlowNodeSchema,
  updateProcessFlowSchema,
} from '@/domain/process-flow';
import type { AuthenticatedUser } from '@/lib/auth';
import type { Supabase } from '@/lib/supabase/types';
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
import { buildProcessFlowAgentInsights } from '../insights/process-flow';
import {
  describeDbError,
  destructiveAnnotations,
  errorResult,
  isNotFound,
  mutateAnnotations,
  readAnnotations,
  resolveAccessibleTeamId,
  resolveProcessFlowIdByName,
  successResult,
  validateToolInput,
  withToolErrorBoundary,
} from '../tool-support';

export function registerProcessFlowTools(server: McpServer, supabase: Supabase, user: AuthenticatedUser): void {
  const getUserScopedClient = () => supabase;
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
}
