import { z } from 'zod';
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
