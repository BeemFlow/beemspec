import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { createProcessFlowSchema, type ProcessFlowView, updateProcessFlowToolSchema } from '@/domain/process-flow';
import type { AuthenticatedUser } from '@/lib/auth';
import type { Supabase } from '@/lib/supabase/types';
import { ProcessFlowDocumentError } from '@/processflow/document';
import {
  createProcessFlow,
  deleteProcessFlow,
  getProcessFlow,
  listProcessFlows,
  updateProcessFlow,
} from '@/processflow/service';
import { buildProcessFlowAgentInsights } from '../insights/process-flow';
import { deletedRowSchema, nonNegativeCountSchema, successOutputSchema } from '../output-schemas';
import { processFlowEntitySchema } from '../process-flow-output-schemas';
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
  mermaid_source: z.string(),
  diagram_revision: z.number().int().positive(),
  diagram_metadata: z.strictObject({
    nodes: z.record(z.string(), z.looseObject({})),
    edges: z.record(z.string(), z.looseObject({})),
  }),
  agent_insights: processFlowInsightsSchema,
  validation: processFlowValidationSchema,
});

function documentContext({ nodes, edges, ...document }: ProcessFlowView) {
  return { ...document, agent_insights: buildProcessFlowAgentInsights(nodes, edges) };
}

function flowError(action: string, error: unknown) {
  return isNotFound(error)
    ? errorResult('Process flow not found')
    : errorResult(`Failed to ${action} process flow`, describeDbError(error));
}

async function saveDocument(action: string, save: () => ReturnType<typeof createProcessFlow>) {
  try {
    const { data, error } = await save();
    return data ? successResult(documentContext(data)) : flowError(action, error);
  } catch (error) {
    if (error instanceof ProcessFlowDocumentError) {
      return errorResult(error.message, { code: error.status === 409 ? 'revision_conflict' : 'invalid_document' });
    }
    throw error;
  }
}

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

      const { data, error } = await getProcessFlow(supabase, resolvedProcessFlowId);
      if (!data) return flowError('load', error);
      return successResult(documentContext(data));
    }),
  );

  server.registerTool(
    'processflow_create',
    {
      title: 'Create Process Flow',
      description: 'Create a process flow from a Mermaid flowchart. Omit mermaid_source to start with an empty flow.',
      inputSchema: createProcessFlowToolSchema,
      outputSchema: successOutputSchema(processFlowContextSchema),
      annotations: createAnnotations,
    },
    withToolErrorBoundary('processflow_create', async (input) => {
      const resolvedTeam = await resolveAccessibleTeamId(supabase, user.id, input.team_id);
      if (!resolvedTeam.ok) return resolvedTeam.response;

      return saveDocument('create', () => createProcessFlow(supabase, { ...input, team_id: resolvedTeam.teamId }));
    }),
  );

  server.registerTool(
    'processflow_update',
    {
      title: 'Update Process Flow',
      description:
        'Save a complete revised Mermaid document, metadata edits, or flow settings. Get the current revision first and preserve existing node and edge IDs.',
      inputSchema: updateProcessFlowToolSchema,
      outputSchema: successOutputSchema(processFlowContextSchema),
      annotations: updateAnnotations,
    },
    withToolErrorBoundary('processflow_update', async ({ process_flow_id, ...changes }) => {
      return saveDocument('update', () => updateProcessFlow(supabase, process_flow_id, changes));
    }),
  );

  server.registerTool(
    'processflow_delete',
    {
      title: 'Delete Process Flow',
      description: 'Destructive. Deletes a process flow and its Mermaid document.',
      inputSchema: z.object({ process_flow_id: z.string().uuid().describe('Process flow UUID to delete') }).strict(),
      outputSchema: successOutputSchema(deletedRowSchema(z.strictObject({ id: z.string().uuid() }))),
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
}
