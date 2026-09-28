import { z } from 'zod';

/** Wrap a tool's successful data contract in the shape returned by successResult. */
export function successOutputSchema<T extends z.ZodType>(dataSchema: T) {
  return z
    .object({
      ok: z.literal(true).describe('Whether the tool call succeeded.'),
      data: dataSchema.describe('Successful tool result.'),
    })
    .strict();
}

export const mcpUuidSchema = z.string().uuid();

/** Database entities may gain columns, but their stable identity is always present. */
export const databaseRowSchema = z.looseObject({
  id: mcpUuidSchema.describe('Stable entity UUID.'),
});

export function deletedRowSchema<T extends z.ZodType>(rowSchema: T) {
  return z.object({ deleted: rowSchema.describe('Deleted entity as it existed before deletion.') }).strict();
}

export const nonNegativeCountSchema = z.number().int().nonnegative();
