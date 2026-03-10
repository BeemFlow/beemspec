import { z } from 'zod';

const uuid = z.string().uuid();
const nullableString = z.string().min(1).nullable();
const linearStatusMappingSchema = z
  .object({
    backlog: nullableString.optional(),
    todo: nullableString.optional(),
    in_progress: nullableString.optional(),
    in_review: nullableString.optional(),
    done: nullableString.optional(),
  })
  .strict();

const atLeastOneField = <T extends Record<string, unknown>>(data: T): boolean =>
  Object.values(data).some((value) => value !== undefined);
const atLeastOneFieldMessage = { message: 'At least one field must be provided' };

export const updateLinearIntegrationSettingsSchema = z
  .object({
    linear_workspace_id: nullableString.optional(),
    linear_team_id: nullableString.optional(),
    linear_status_mapping: linearStatusMappingSchema.optional(),
  })
  .refine(atLeastOneField, atLeastOneFieldMessage);

export const updateStoryMapLinearSettingsSchema = z
  .object({
    linear_project_id: nullableString.optional(),
    use_team_status_mapping: z.boolean().optional(),
    linear_status_mapping: linearStatusMappingSchema.optional(),
    auto_import_labeled_issues: z.boolean().optional(),
    import_label_name: z.string().trim().min(1).max(100).optional(),
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
export type UpdateStoryMapLinearSettings = z.infer<typeof updateStoryMapLinearSettingsSchema>;
export type LinearSyncStoryRequest = z.infer<typeof linearSyncStorySchema>;
export type LinearSyncBatchRequest = z.infer<typeof linearSyncBatchSchema>;
