import { z } from 'zod';
import { processFlowEdgeTypeSchema, processFlowNodeTypeSchema } from '@/domain/process-flow/schemas';
import { databaseRowSchema, mcpUuidSchema } from './output-schemas';

const nullableTextSchema = z.string().nullable();

export const processFlowEntitySchema = databaseRowSchema.extend({
  team_id: mcpUuidSchema,
  name: z.string(),
  description: nullableTextSchema,
  context_markdown: nullableTextSchema,
  viewport: z.strictObject({ x: z.number(), y: z.number(), zoom: z.number() }).nullable(),
  schema_version: z.literal(1),
});

// Legacy stored content may predate the bounds and nonempty text required for new inputs.
const processFlowNodeEntitySchema = databaseRowSchema.extend({
  process_flow_id: mcpUuidSchema,
  type: processFlowNodeTypeSchema,
  data: z.looseObject({
    label: z.string(),
    owner_role: nullableTextSchema.optional(),
    systems: z.array(z.string()).optional(),
    inputs: z.array(z.string()).optional(),
    outputs: z.array(z.string()).optional(),
    pain_points: nullableTextSchema.optional(),
    notes: nullableTextSchema.optional(),
    automation_opportunity: nullableTextSchema.optional(),
    frequency: nullableTextSchema.optional(),
    estimated_duration: nullableTextSchema.optional(),
    time_constraint: nullableTextSchema.optional(),
  }),
});

/** Single-node mutations return database rows; reads, batches and layout return mapped nodes. */
export const processFlowNodeRowSchema = processFlowNodeEntitySchema.extend({
  position_x: z.number(),
  position_y: z.number(),
  width: z.number().nullable(),
  height: z.number().nullable(),
});

export const processFlowNodeSchema = processFlowNodeEntitySchema.extend({
  position: z.strictObject({ x: z.number(), y: z.number() }),
  size: z.strictObject({ width: z.number().optional(), height: z.number().optional() }).nullable(),
});

export const processFlowEdgeEntitySchema = databaseRowSchema.extend({
  process_flow_id: mcpUuidSchema,
  type: processFlowEdgeTypeSchema,
  source_node_id: mcpUuidSchema,
  target_node_id: mcpUuidSchema,
  data: z.looseObject({ label: nullableTextSchema.optional(), condition: nullableTextSchema.optional() }).nullable(),
});
