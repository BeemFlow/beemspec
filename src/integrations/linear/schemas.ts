import { z } from 'zod';

const uuid = z.string().uuid();
const nullableString = z.string().min(1).nullable();

const atLeastOneField = <T extends Record<string, unknown>>(data: T): boolean =>
  Object.values(data).some((value) => value !== undefined);
const atLeastOneFieldMessage = { message: 'At least one field must be provided' };

export const updateLinearIntegrationSettingsSchema = z
  .object({
    linear_workspace_id: nullableString.optional(),
    linear_team_id: nullableString.optional(),
    linear_project_id: nullableString.optional(),
    linear_state_id: nullableString.optional(),
  })
  .refine(atLeastOneField, atLeastOneFieldMessage);

export const linearSyncStorySchema = z.object({
  story_id: uuid,
});

export const linearSyncBatchSchema = z
  .object({
    story_ids: z.array(uuid).min(1).max(200).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    older_than_minutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60)
      .optional(),
  })
  .default({});

export type UpdateLinearIntegrationSettings = z.infer<typeof updateLinearIntegrationSettingsSchema>;
export type LinearSyncStoryRequest = z.infer<typeof linearSyncStorySchema>;
export type LinearSyncBatchRequest = z.infer<typeof linearSyncBatchSchema>;
