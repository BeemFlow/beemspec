import { z } from 'zod';

const MAX_TEXT_LENGTH = 20_000;
const MAX_MARKDOWN_LENGTH = 100_000;
const MAX_COLLECTION_ITEMS = 200;
const MAX_BATCH_MUTATIONS = 100;

const uuid = (description: string) => z.string().uuid().describe(description);
const nullableText = (description: string, max = MAX_TEXT_LENGTH) =>
  z.string().min(1).max(max).nullable().describe(`${description} Pass null to clear it.`);
const name = (description: string) => z.string().min(1, 'Required').max(200).describe(description);
const nonEmptyLabel = (description: string) => z.string().min(1, 'Required').max(200).describe(description);
const stringList = (description: string, itemDescription: string) =>
  z
    .array(z.string().min(1).max(2_000).describe(itemDescription))
    .max(MAX_COLLECTION_ITEMS, `Collection cannot contain more than ${MAX_COLLECTION_ITEMS} items`)
    .describe(description);

const atLeastOneField = <T extends Record<string, unknown>>(data: T): boolean =>
  Object.values(data).some((value) => value !== undefined);
const atLeastOneFieldMessage = { message: 'At least one field must be provided' };
const updateDescription = (entity: string) => `Fields to change for the ${entity}; at least one change is required.`;

export const processFlowViewportSchema = z
  .object({
    x: z.number().finite().describe('Canvas viewport horizontal offset in pixels.'),
    y: z.number().finite().describe('Canvas viewport vertical offset in pixels.'),
    zoom: z.number().finite().positive().describe('Positive canvas zoom multiplier.'),
  })
  .strict();

export const processFlowNodeTypeSchema = z
  .enum(['step', 'decision', 'subprocess', 'actor', 'system', 'note'])
  .describe('Semantic node type used to render and interpret the process step.');

export const processFlowEdgeTypeSchema = z
  .enum(['flow', 'handoff', 'exception', 'dependency'])
  .describe('Semantic relationship represented by the edge.');

export const processFlowNodeDataSchema = z
  .object({
    label: nonEmptyLabel('Short text displayed inside the node.'),
    owner_role: nullableText('Role accountable for this step.').optional(),
    systems: stringList('Systems or applications involved in this step.', 'System or application name.').optional(),
    inputs: stringList('Information or artifacts consumed by this step.', 'Input name or description.').optional(),
    outputs: stringList('Information or artifacts produced by this step.', 'Output name or description.').optional(),
    pain_points: nullableText('Known friction, failures, or user pain at this step.').optional(),
    notes: nullableText('Additional operational notes for this step.').optional(),
    automation_opportunity: nullableText('Potential automation or improvement opportunity.').optional(),
    frequency: nullableText('How often this step occurs, expressed in natural language.').optional(),
    estimated_duration: nullableText('Typical elapsed or active duration, including units.').optional(),
    time_constraint: nullableText('Deadline, timing window, or service-level constraint.').optional(),
  })
  .strict();

export const processFlowEdgeDataSchema = z
  .object({
    label: nullableText('Short text displayed on the connection.').optional(),
    condition: nullableText('Rule or event that determines when this path is taken.').optional(),
  })
  .strict();

export const processFlowBase = z
  .object({
    team_id: uuid('Team UUID that owns the process flow.'),
    name: name('Human-readable process flow name.'),
    description: nullableText('Short process flow description.'),
    context_markdown: nullableText(
      'Long-form Markdown operational context, decisions, constraints, and links for agents.',
      MAX_MARKDOWN_LENGTH,
    ),
    viewport: processFlowViewportSchema.nullable().optional().describe('Saved canvas viewport. Pass null to clear it.'),
  })
  .strict();

export const createProcessFlowSchema = processFlowBase.partial({
  description: true,
  context_markdown: true,
  viewport: true,
});

const updateProcessFlowFieldsSchema = processFlowBase.omit({ team_id: true }).partial().strict();

export const updateProcessFlowSchema = updateProcessFlowFieldsSchema
  .refine(atLeastOneField, atLeastOneFieldMessage)
  .describe(updateDescription('process flow'));

export const updateProcessFlowToolSchema = updateProcessFlowFieldsSchema
  .extend({ process_flow_id: uuid('Process flow UUID to update.') })
  .refine(({ process_flow_id: _processFlowId, ...changes }) => atLeastOneField(changes), atLeastOneFieldMessage)
  .describe(updateDescription('process flow'));

export const processFlowNodeBase = z
  .object({
    process_flow_id: uuid('Process flow UUID that owns the node.'),
    type: processFlowNodeTypeSchema,
    position: z
      .object({
        x: z.number().finite().describe('Horizontal canvas coordinate in pixels.'),
        y: z.number().finite().describe('Vertical canvas coordinate in pixels.'),
      })
      .strict()
      .describe('Absolute node position on the process-flow canvas.'),
    size: z
      .object({
        width: z.number().finite().positive().optional().describe('Rendered node width in pixels.'),
        height: z.number().finite().positive().optional().describe('Rendered node height in pixels.'),
      })
      .strict()
      .nullable()
      .optional()
      .describe('Optional rendered node dimensions. Pass null to clear them.'),
    data: processFlowNodeDataSchema.describe('Operational content displayed by and associated with this node.'),
  })
  .strict();

export const createProcessFlowNodeSchema = processFlowNodeBase;

const updateProcessFlowNodeFieldsSchema = processFlowNodeBase.omit({ process_flow_id: true }).partial().strict();

export const updateProcessFlowNodeSchema = updateProcessFlowNodeFieldsSchema
  .refine(atLeastOneField, atLeastOneFieldMessage)
  .describe(updateDescription('process flow node'));

export const updateProcessFlowNodeToolSchema = updateProcessFlowNodeFieldsSchema
  .extend({
    process_flow_id: uuid('Process flow UUID that owns the node.'),
    node_id: uuid('Node UUID to update.'),
  })
  .refine(
    ({ process_flow_id: _processFlowId, node_id: _nodeId, ...changes }) => atLeastOneField(changes),
    atLeastOneFieldMessage,
  )
  .describe(updateDescription('process flow node'));

export const createProcessFlowNodeBodySchema = processFlowNodeBase.omit({ process_flow_id: true });

export const processFlowEdgeBase = z
  .object({
    process_flow_id: uuid('Process flow UUID that owns the edge.'),
    type: processFlowEdgeTypeSchema,
    source_node_id: uuid('Node UUID where the directed edge starts.'),
    target_node_id: uuid('Node UUID where the directed edge ends.'),
    data: processFlowEdgeDataSchema.nullable().optional().describe('Optional edge label and routing condition.'),
  })
  .strict();

export const createProcessFlowEdgeSchema = processFlowEdgeBase;

const updateProcessFlowEdgeFieldsSchema = processFlowEdgeBase
  .omit({ process_flow_id: true, source_node_id: true, target_node_id: true })
  .partial()
  .strict();

export const updateProcessFlowEdgeSchema = updateProcessFlowEdgeFieldsSchema
  .refine(atLeastOneField, atLeastOneFieldMessage)
  .describe(updateDescription('process flow edge'));

export const updateProcessFlowEdgeToolSchema = updateProcessFlowEdgeFieldsSchema
  .extend({
    process_flow_id: uuid('Process flow UUID that owns the edge.'),
    edge_id: uuid('Edge UUID to update.'),
  })
  .refine(
    ({ process_flow_id: _processFlowId, edge_id: _edgeId, ...changes }) => atLeastOneField(changes),
    atLeastOneFieldMessage,
  )
  .describe(updateDescription('process flow edge'));

export const createProcessFlowEdgeBodySchema = processFlowEdgeBase.omit({ process_flow_id: true });

export const batchProcessFlowNodeMutationSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create').describe('Create a new node.'),
      payload: createProcessFlowNodeBodySchema.describe('Complete new node definition.'),
    })
    .strict(),
  z
    .object({
      action: z.literal('update').describe('Update an existing node.'),
      id: uuid('Node UUID to update.'),
      payload: updateProcessFlowNodeSchema.describe('Node changes; at least one change is required.'),
    })
    .strict(),
  z
    .object({
      action: z.literal('delete').describe('Delete an existing node.'),
      id: uuid('Node UUID to delete.'),
    })
    .strict(),
]);

export const batchMutateProcessFlowNodesSchema = z
  .object({
    process_flow_id: uuid('Process flow UUID whose nodes will be mutated.'),
    mutations: z
      .array(batchProcessFlowNodeMutationSchema)
      .min(1, 'At least one mutation is required')
      .max(MAX_BATCH_MUTATIONS, `Batch cannot contain more than ${MAX_BATCH_MUTATIONS} mutations`)
      .describe('Ordered node mutations applied atomically in one transaction.'),
  })
  .strict();

export const batchProcessFlowNodesBodySchema = batchMutateProcessFlowNodesSchema.omit({ process_flow_id: true });

export const batchProcessFlowEdgeMutationSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('create').describe('Create a new edge.'),
      payload: createProcessFlowEdgeBodySchema.describe('Complete new edge definition.'),
    })
    .strict(),
  z
    .object({
      action: z.literal('update').describe('Update an existing edge.'),
      id: uuid('Edge UUID to update.'),
      payload: updateProcessFlowEdgeSchema.describe('Edge changes; at least one change is required.'),
    })
    .strict(),
  z
    .object({
      action: z.literal('delete').describe('Delete an existing edge.'),
      id: uuid('Edge UUID to delete.'),
    })
    .strict(),
]);

export const batchMutateProcessFlowEdgesSchema = z
  .object({
    process_flow_id: uuid('Process flow UUID whose edges will be mutated.'),
    mutations: z
      .array(batchProcessFlowEdgeMutationSchema)
      .min(1, 'At least one mutation is required')
      .max(MAX_BATCH_MUTATIONS, `Batch cannot contain more than ${MAX_BATCH_MUTATIONS} mutations`)
      .describe('Ordered edge mutations applied atomically in one transaction.'),
  })
  .strict();

export const batchProcessFlowEdgesBodySchema = batchMutateProcessFlowEdgesSchema.omit({ process_flow_id: true });

export const processFlowAutolayoutSchema = z
  .object({
    process_flow_id: uuid('Process flow UUID to lay out deterministically.'),
  })
  .strict();

export const processFlowValidationRequestSchema = z
  .object({
    process_flow_id: uuid('Process flow UUID to validate.'),
  })
  .strict();

export type CreateProcessFlow = z.infer<typeof createProcessFlowSchema>;
export type UpdateProcessFlow = z.infer<typeof updateProcessFlowSchema>;

export type CreateProcessFlowNode = z.infer<typeof createProcessFlowNodeSchema>;
export type UpdateProcessFlowNode = z.infer<typeof updateProcessFlowNodeSchema>;
export type CreateProcessFlowNodeBody = z.infer<typeof createProcessFlowNodeBodySchema>;

export type CreateProcessFlowEdge = z.infer<typeof createProcessFlowEdgeSchema>;
export type UpdateProcessFlowEdge = z.infer<typeof updateProcessFlowEdgeSchema>;
export type CreateProcessFlowEdgeBody = z.infer<typeof createProcessFlowEdgeBodySchema>;

export type BatchProcessFlowNodeMutation = z.infer<typeof batchProcessFlowNodeMutationSchema>;
export type BatchMutateProcessFlowNodes = z.infer<typeof batchMutateProcessFlowNodesSchema>;
export type BatchProcessFlowNodesBody = z.infer<typeof batchProcessFlowNodesBodySchema>;

export type BatchProcessFlowEdgeMutation = z.infer<typeof batchProcessFlowEdgeMutationSchema>;
export type BatchMutateProcessFlowEdges = z.infer<typeof batchMutateProcessFlowEdgesSchema>;
export type BatchProcessFlowEdgesBody = z.infer<typeof batchProcessFlowEdgesBodySchema>;

export type ProcessFlowAutolayoutRequest = z.infer<typeof processFlowAutolayoutSchema>;
export type ProcessFlowValidationRequest = z.infer<typeof processFlowValidationRequestSchema>;
