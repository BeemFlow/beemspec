import { z } from 'zod';

const statusMappingSchema = z.record(z.string(), z.string());

const effectiveLinearSettingsSchema = z.object({
  linear_project_id: z.string().nullable(),
  linear_status_mapping: statusMappingSchema,
  auto_import_labeled_issues: z.boolean(),
  import_label_name: z.string(),
});

export const storyMapLinearSettingsResponseSchema = z.object({
  story_map_id: z.string(),
  team_id: z.string(),
  can_edit: z.boolean(),
  team_settings: z.object({
    linear_connected: z.boolean(),
    linear_team_id: z.string().nullable(),
    linear_status_mapping: statusMappingSchema,
  }),
  story_map_settings: effectiveLinearSettingsSchema.extend({
    use_team_status_mapping: z.boolean(),
    updated_at: z.string().nullable(),
  }),
  effective_settings: effectiveLinearSettingsSchema,
});

export const manualLinearSyncResponseSchema = z
  .object({
    success: z.literal(true),
    stories: z.object({
      considered: z.number().int().nonnegative(),
      processed: z.number().int().nonnegative(),
      succeeded: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      ignored: z.number().int().nonnegative(),
      created_in_linear: z.number().int().nonnegative(),
      synced_to_linear: z.number().int().nonnegative(),
      synced_from_linear: z.number().int().nonnegative(),
    }),
    imports: z.object({
      considered: z.number().int().nonnegative(),
      imported: z.number().int().nonnegative(),
      skipped: z.number().int().nonnegative(),
      skipped_already_linked: z.number().int().nonnegative(),
      skipped_no_candidate: z.number().int().nonnegative(),
    }),
  })
  .passthrough();

export type StoryMapLinearSettingsResponse = z.infer<typeof storyMapLinearSettingsResponseSchema>;
export type ManualLinearSyncResponse = z.infer<typeof manualLinearSyncResponseSchema>;
