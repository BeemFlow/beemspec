import { z } from 'zod';

const uuid = z.string().uuid();
const nullableString = z.string().min(1).nullable();
const name = z.string().min(1, 'Required').max(200);
const nonEmptyLabel = z.string().min(1, 'Required').max(200);

const atLeastOneField = <T extends Record<string, unknown>>(data: T): boolean =>
  Object.values(data).some((value) => value !== undefined);
const atLeastOneFieldMessage = { message: 'At least one field must be provided' };

export const processFlowViewportSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    zoom: z.number().positive(),
  })
  .strict();

export const processFlowNodeTypeSchema = z.enum(['step', 'decision', 'subprocess', 'actor', 'system', 'note']);

export const processFlowEdgeTypeSchema = z.enum(['flow', 'handoff', 'exception', 'dependency']);

export const processFlowNodeDataSchema = z
  .object({
    label: nonEmptyLabel,
    owner_role: nullableString.optional(),
    systems: z.array(z.string().min(1)).optional(),
    inputs: z.array(z.string().min(1)).optional(),
    outputs: z.array(z.string().min(1)).optional(),
    pain_points: nullableString.optional(),
    notes: nullableString.optional(),
    automation_opportunity: nullableString.optional(),
    frequency: nullableString.optional(),
    estimated_duration: nullableString.optional(),
    time_constraint: nullableString.optional(),
  })
  .strict();

export const processFlowEdgeDataSchema = z
  .object({
    label: nullableString.optional(),
    condition: nullableString.optional(),
  })
  .strict();

export const processFlowBase = z
  .object({
    team_id: uuid,
    name,
    description: nullableString,
    context_markdown: nullableString,
    viewport: processFlowViewportSchema.nullable().optional(),
  })
  .strict();

export const createProcessFlowSchema = processFlowBase.partial({
  description: true,
  context_markdown: true,
  viewport: true,
});

const updateProcessFlowFieldsSchema = processFlowBase.omit({ team_id: true }).partial().strict();

export const updateProcessFlowSchema = updateProcessFlowFieldsSchema.refine(atLeastOneField, atLeastOneFieldMessage);

export const updateProcessFlowToolSchema = updateProcessFlowFieldsSchema
  .extend({ process_flow_id: uuid })
  .refine(({ process_flow_id: _processFlowId, ...changes }) => atLeastOneField(changes), atLeastOneFieldMessage);

export const processFlowNodeBase = z
  .object({
    process_flow_id: uuid,
    type: processFlowNodeTypeSchema,
    position: z.object({ x: z.number(), y: z.number() }).strict(),
    size: z
      .object({
        width: z.number().positive().optional(),
        height: z.number().positive().optional(),
      })
      .strict()
      .nullable()
      .optional(),
    data: processFlowNodeDataSchema,
  })
  .strict();

export const createProcessFlowNodeSchema = processFlowNodeBase;

const updateProcessFlowNodeFieldsSchema = processFlowNodeBase.omit({ process_flow_id: true }).partial().strict();

export const updateProcessFlowNodeSchema = updateProcessFlowNodeFieldsSchema.refine(
  atLeastOneField,
  atLeastOneFieldMessage,
);

export const updateProcessFlowNodeToolSchema = updateProcessFlowNodeFieldsSchema
  .extend({ process_flow_id: uuid, node_id: uuid })
  .refine(
    ({ process_flow_id: _processFlowId, node_id: _nodeId, ...changes }) => atLeastOneField(changes),
    atLeastOneFieldMessage,
  );

export const createProcessFlowNodeBodySchema = processFlowNodeBase.omit({ process_flow_id: true });

export const processFlowEdgeBase = z
  .object({
    process_flow_id: uuid,
    type: processFlowEdgeTypeSchema,
    source_node_id: uuid,
    target_node_id: uuid,
    data: processFlowEdgeDataSchema.nullable().optional(),
  })
  .strict();

export const createProcessFlowEdgeSchema = processFlowEdgeBase;

const updateProcessFlowEdgeFieldsSchema = processFlowEdgeBase
  .omit({ process_flow_id: true, source_node_id: true, target_node_id: true })
  .partial()
  .strict();

export const updateProcessFlowEdgeSchema = updateProcessFlowEdgeFieldsSchema.refine(
  atLeastOneField,
  atLeastOneFieldMessage,
);

export const updateProcessFlowEdgeToolSchema = updateProcessFlowEdgeFieldsSchema
  .extend({ process_flow_id: uuid, edge_id: uuid })
  .refine(
    ({ process_flow_id: _processFlowId, edge_id: _edgeId, ...changes }) => atLeastOneField(changes),
    atLeastOneFieldMessage,
  );

export const createProcessFlowEdgeBodySchema = processFlowEdgeBase.omit({ process_flow_id: true });

export const batchProcessFlowNodeMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), payload: createProcessFlowNodeBodySchema }).strict(),
  z.object({ action: z.literal('update'), id: uuid, payload: updateProcessFlowNodeSchema }).strict(),
  z.object({ action: z.literal('delete'), id: uuid }).strict(),
]);

export const batchMutateProcessFlowNodesSchema = z
  .object({
    process_flow_id: uuid,
    mutations: z.array(batchProcessFlowNodeMutationSchema).min(1, 'At least one mutation is required'),
  })
  .strict();

export const batchProcessFlowNodesBodySchema = batchMutateProcessFlowNodesSchema.omit({ process_flow_id: true });

export const batchProcessFlowEdgeMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), payload: createProcessFlowEdgeBodySchema }).strict(),
  z.object({ action: z.literal('update'), id: uuid, payload: updateProcessFlowEdgeSchema }).strict(),
  z.object({ action: z.literal('delete'), id: uuid }).strict(),
]);

export const batchMutateProcessFlowEdgesSchema = z
  .object({
    process_flow_id: uuid,
    mutations: z.array(batchProcessFlowEdgeMutationSchema).min(1, 'At least one mutation is required'),
  })
  .strict();

export const batchProcessFlowEdgesBodySchema = batchMutateProcessFlowEdgesSchema.omit({ process_flow_id: true });

export const processFlowAutolayoutSchema = z
  .object({
    process_flow_id: uuid,
  })
  .strict();

export const processFlowValidationRequestSchema = z
  .object({
    process_flow_id: uuid,
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
