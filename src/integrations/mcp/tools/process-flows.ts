import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  createProcessFlowEdgeSchema,
  createProcessFlowNodeSchema,
  createProcessFlowSchema,
  processFlowAutolayoutSchema,
  updateProcessFlowEdgeToolSchema,
  updateProcessFlowNodeToolSchema,
  updateProcessFlowToolSchema,
} from '@/domain/process-flow/schemas';
import type { AuthenticatedUser } from '@/lib/auth';
import type { Supabase } from '@/lib/supabase/types';
import {
  autolayoutProcessFlow,
  batchMutateProcessFlowEdges,
  batchMutateProcessFlowNodes,
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
import { batchMutateProcessFlowEdgesSchema, batchMutateProcessFlowNodesSchema } from '../input-schemas';
import { buildProcessFlowAgentInsights } from '../insights/process-flow';
import { deletedRowSchema, nonNegativeCountSchema, successOutputSchema } from '../output-schemas';
import {
  processFlowEdgeEntitySchema,
  processFlowEntitySchema,
  processFlowNodeRowSchema,
  processFlowNodeSchema,
} from '../process-flow-output-schemas';
import {
  createAnnotations,
  describeDbError,
  destructiveAnnotations,
  errorResult,
  isNotFound,
  readAnnotations,
  resolveAccessibleTeamId,
  resolveProcessFlowIdByName,
  successResult,
  updateAnnotations,
  withToolErrorBoundary,
} from '../tool-support';

const createProcessFlowToolSchema = createProcessFlowSchema.extend({
  team_id: z.string().uuid().optional().describe('Team UUID (optional for single-team users)'),
});

const processFlowValidationSchema = z
  .object({
    warnings: z.array(
      z
        .object({
          code: z.string(),
          message: z.string(),
          node_ids: z.array(z.string()).optional(),
          edge_ids: z.array(z.string()).optional(),
        })
        .strict(),
    ),
  })
  .strict();

const processFlowInsightsSchema = z
  .object({
    nodeCountsByType: z.record(z.string(), nonNegativeCountSchema),
    edgeCount: nonNegativeCountSchema,
    automationCandidates: nonNegativeCountSchema,
    ownershipTaggedNodes: nonNegativeCountSchema,
    frequencyTaggedNodes: nonNegativeCountSchema,
    timeConstrainedNodes: nonNegativeCountSchema,
    labeledEdges: nonNegativeCountSchema,
    conditionedEdges: nonNegativeCountSchema,
  })
  .strict();

const processFlowContextSchema = processFlowEntitySchema.extend({
  nodes: z.array(processFlowNodeSchema),
  edges: z.array(processFlowEdgeEntitySchema),
  agent_insights: processFlowInsightsSchema,
  validation: processFlowValidationSchema,
});

const processFlowNodeMutationResultSchema = z
  .object({
    created: z.array(processFlowNodeSchema),
    updated: z.array(processFlowNodeSchema),
    deleted: z.array(processFlowNodeSchema),
  })
  .strict();

const processFlowEdgeMutationResultSchema = z
  .object({
    created: z.array(processFlowEdgeEntitySchema),
    updated: z.array(processFlowEdgeEntitySchema),
    deleted: z.array(processFlowEdgeEntitySchema),
  })
  .strict();

const processFlowAutolayoutResultSchema = z
  .object({
    nodes: z.array(processFlowNodeSchema),
    edges: z.array(processFlowEdgeEntitySchema),
  })
  .strict();

const batchMutationAnnotations = {
  ...createAnnotations,
  destructiveHint: true,
} as const;

export function registerProcessFlowTools(server: McpServer, supabase: Supabase, user: AuthenticatedUser): void {
  server.registerTool(
    'processflow_list',
    {
      title: 'List Process Flows',
      description:
        'Starting point. List process flows for a team. team_id is optional when the user has exactly one team.',
      inputSchema: z
        .object({ team_id: z.string().uuid().optional().describe('Team UUID (optional for single-team users)') })
        .strict(),
      outputSchema: successOutputSchema(z.array(processFlowEntitySchema)),
      annotations: readAnnotations,
    },
    withToolErrorBoundary('processflow_list', async ({ team_id }) => {
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
        'Primary context loader. Select exactly one lookup mode: process_flow_id, or process_flow_name with optional team_id.',
      inputSchema: z
        .object({
          process_flow_id: z
            .string()
            .uuid()
            .optional()
            .describe('Exact process flow UUID; omit process_flow_name when using this lookup mode'),
          process_flow_name: z
            .string()
            .min(1)
            .max(200)
            .optional()
            .describe('Exact process flow name; omit process_flow_id when using this lookup mode'),
          team_id: z
            .string()
            .uuid()
            .optional()
            .describe('Team UUID used only to disambiguate process_flow_name matches'),
        })
        .strict()
        .refine(({ process_flow_id, process_flow_name }) => Boolean(process_flow_id) !== Boolean(process_flow_name), {
          message: 'Provide exactly one of process_flow_id or process_flow_name',
        })
        .meta({ oneOf: [{ required: ['process_flow_id'] }, { required: ['process_flow_name'] }] }),
      outputSchema: successOutputSchema(processFlowContextSchema),
      annotations: readAnnotations,
    },
    withToolErrorBoundary('processflow_get', async ({ process_flow_id, process_flow_name, team_id }) => {
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
      inputSchema: z.object({ process_flow_id: z.string().uuid().describe('Process flow UUID') }).strict(),
      outputSchema: successOutputSchema(processFlowValidationSchema),
      annotations: readAnnotations,
    },
    withToolErrorBoundary('processflow_validation_get', async ({ process_flow_id }) => {
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
      inputSchema: createProcessFlowToolSchema,
      outputSchema: successOutputSchema(processFlowEntitySchema),
      annotations: createAnnotations,
    },
    withToolErrorBoundary('processflow_create', async (input) => {
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
      inputSchema: updateProcessFlowToolSchema,
      outputSchema: successOutputSchema(processFlowEntitySchema),
      annotations: updateAnnotations,
    },
    withToolErrorBoundary('processflow_update', async ({ process_flow_id, ...changes }) => {
      const { data, error } = await updateProcessFlow(supabase, process_flow_id, changes);
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
      inputSchema: z.object({ process_flow_id: z.string().uuid().describe('Process flow UUID to delete') }).strict(),
      outputSchema: successOutputSchema(deletedRowSchema(processFlowEntitySchema)),
      annotations: destructiveAnnotations,
    },
    withToolErrorBoundary('processflow_delete', async ({ process_flow_id }) => {
      const { data, error } = await deleteProcessFlow(supabase, process_flow_id);
      if (error) {
        if (isNotFound(error)) return errorResult('Process flow not found');
        return errorResult('Failed to delete process flow', describeDbError(error));
      }

      return successResult({ deleted: data });
    }),
  );

  server.registerTool(
    'processflow_nodes_mutate',
    {
      title: 'Batch Mutate Process Flow Nodes',
      description:
        'Atomically apply multiple related node creates, updates, or deletes to one process flow. Prefer this batch tool for coordinated graph changes; use the single-node tools for one isolated change.',
      inputSchema: batchMutateProcessFlowNodesSchema,
      outputSchema: successOutputSchema(processFlowNodeMutationResultSchema),
      annotations: batchMutationAnnotations,
    },
    withToolErrorBoundary('processflow_nodes_mutate', async (input) => {
      const { data, error } = await batchMutateProcessFlowNodes(supabase, input);
      if (error || !data) {
        if (isNotFound(error)) return errorResult('Process flow not found');
        return errorResult('Failed to mutate process flow nodes', describeDbError(error));
      }

      return successResult(data);
    }),
  );

  server.registerTool(
    'processflow_node_create',
    {
      title: 'Create Process Flow Node',
      description:
        'Create one isolated node. Prefer processflow_nodes_mutate for multiple related node changes. Node data fields include label, owner_role, systems, inputs, outputs, pain_points, notes, automation_opportunity, frequency, estimated_duration, and time_constraint.',
      inputSchema: createProcessFlowNodeSchema,
      outputSchema: successOutputSchema(processFlowNodeRowSchema),
      annotations: createAnnotations,
    },
    withToolErrorBoundary('processflow_node_create', async (input) => {
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
        'Update one isolated node. Prefer processflow_nodes_mutate for multiple related node changes. Use this for label, ownership, metadata, position, or node data changes including systems, inputs, outputs, pain_points, notes, automation_opportunity, frequency, estimated_duration, and time_constraint.',
      inputSchema: updateProcessFlowNodeToolSchema,
      outputSchema: successOutputSchema(processFlowNodeRowSchema),
      annotations: updateAnnotations,
    },
    withToolErrorBoundary('processflow_node_update', async ({ process_flow_id, node_id, ...changes }) => {
      const { data, error } = await updateProcessFlowNode(supabase, process_flow_id, node_id, changes);
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
      inputSchema: z
        .object({
          process_flow_id: z.string().uuid().describe('UUID of the process flow containing the node'),
          node_id: z.string().uuid().describe('Process flow node UUID to delete'),
        })
        .strict(),
      outputSchema: successOutputSchema(deletedRowSchema(processFlowNodeRowSchema)),
      annotations: destructiveAnnotations,
    },
    withToolErrorBoundary('processflow_node_delete', async ({ process_flow_id, node_id }) => {
      const { data, error } = await deleteProcessFlowNode(supabase, process_flow_id, node_id);
      if (error) {
        if (isNotFound(error)) return errorResult('Process flow node not found');
        return errorResult('Failed to delete process flow node', describeDbError(error));
      }

      return successResult({ deleted: data });
    }),
  );

  server.registerTool(
    'processflow_edges_mutate',
    {
      title: 'Batch Mutate Process Flow Edges',
      description:
        'Atomically apply multiple related edge creates, updates, or deletes to one process flow. Prefer this batch tool for coordinated graph changes; use the single-edge tools for one isolated change.',
      inputSchema: batchMutateProcessFlowEdgesSchema,
      outputSchema: successOutputSchema(processFlowEdgeMutationResultSchema),
      annotations: batchMutationAnnotations,
    },
    withToolErrorBoundary('processflow_edges_mutate', async (input) => {
      const { data, error } = await batchMutateProcessFlowEdges(supabase, input);
      if (error || !data) {
        if (isNotFound(error)) return errorResult('Process flow not found');
        return errorResult('Failed to mutate process flow edges', describeDbError(error));
      }

      return successResult(data);
    }),
  );

  server.registerTool(
    'processflow_edge_create',
    {
      title: 'Create Process Flow Edge',
      description:
        'Create one isolated edge between two nodes. Prefer processflow_edges_mutate for multiple related edge changes. Edge data fields include label and condition.',
      inputSchema: createProcessFlowEdgeSchema,
      outputSchema: successOutputSchema(processFlowEdgeEntitySchema),
      annotations: createAnnotations,
    },
    withToolErrorBoundary('processflow_edge_create', async (input) => {
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
        'Update one isolated edge. Prefer processflow_edges_mutate for multiple related edge changes. Use this for type changes or edge data updates including label and condition.',
      inputSchema: updateProcessFlowEdgeToolSchema,
      outputSchema: successOutputSchema(processFlowEdgeEntitySchema),
      annotations: updateAnnotations,
    },
    withToolErrorBoundary('processflow_edge_update', async ({ process_flow_id, edge_id, ...changes }) => {
      const { data, error } = await updateProcessFlowEdge(supabase, process_flow_id, edge_id, changes);
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
      inputSchema: z
        .object({
          process_flow_id: z.string().uuid().describe('UUID of the process flow containing the edge'),
          edge_id: z.string().uuid().describe('Process flow edge UUID to delete'),
        })
        .strict(),
      outputSchema: successOutputSchema(deletedRowSchema(processFlowEdgeEntitySchema)),
      annotations: destructiveAnnotations,
    },
    withToolErrorBoundary('processflow_edge_delete', async ({ process_flow_id, edge_id }) => {
      const { data, error } = await deleteProcessFlowEdge(supabase, process_flow_id, edge_id);
      if (error) {
        if (isNotFound(error)) return errorResult('Process flow edge not found');
        return errorResult('Failed to delete process flow edge', describeDbError(error));
      }

      return successResult({ deleted: data });
    }),
  );

  server.registerTool(
    'processflow_autolayout',
    {
      title: 'Autolayout Process Flow',
      description:
        'Deterministically reposition every node in a process flow without changing graph semantics. Use after structural edits; repeating it against the same graph is safe.',
      inputSchema: processFlowAutolayoutSchema,
      outputSchema: successOutputSchema(processFlowAutolayoutResultSchema),
      annotations: updateAnnotations,
    },
    withToolErrorBoundary('processflow_autolayout', async ({ process_flow_id }) => {
      const { data, error } = await autolayoutProcessFlow(supabase, process_flow_id);
      if (error || !data) {
        if (isNotFound(error)) return errorResult('Process flow not found');
        return errorResult('Failed to lay out process flow', describeDbError(error));
      }

      return successResult(data);
    }),
  );
}
