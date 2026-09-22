import { z } from 'zod';
import { storyStatus } from '@/domain/story-map/schemas';
import { databaseRowSchema, mcpUuidSchema } from './output-schemas';

const nullableTextSchema = z.string().nullable();

export const storyMapRowSchema = databaseRowSchema.extend({
  name: z.string(),
  description: nullableTextSchema.optional(),
  context_markdown: nullableTextSchema.optional(),
});

export const activityRowSchema = databaseRowSchema.extend({
  story_map_id: mcpUuidSchema,
  name: z.string(),
  description: nullableTextSchema.optional(),
  sort_order: z.number().int(),
});

export const taskRowSchema = activityRowSchema.omit({ story_map_id: true }).extend({
  activity_id: mcpUuidSchema,
});

export const releaseRowSchema = activityRowSchema.extend({
  context_markdown: nullableTextSchema.optional(),
});

export const personaSummarySchema = databaseRowSchema.extend({
  name: z.string(),
  description: nullableTextSchema.optional(),
  goals: nullableTextSchema.optional(),
});

export const personaRowSchema = personaSummarySchema.extend({ story_map_id: mcpUuidSchema });

// Output accepts legacy content written before the current input constraints.
export const storyRowSchema = databaseRowSchema.extend({
  task_id: mcpUuidSchema,
  release_id: mcpUuidSchema.nullable(),
  title: z.string(),
  status: storyStatus,
  sort_order: z.number().int(),
  content: z.looseObject({
    _version: z.literal(1).optional(),
    user_story: z.string().optional(),
    acceptance_criteria: z.string().optional(),
    figma_link: nullableTextSchema.optional(),
    edge_cases: nullableTextSchema.optional(),
    technical_guidelines: nullableTextSchema.optional(),
  }),
});

export const mutationGuidanceSchema = z.strictObject({
  next_recommended_reads: z.array(z.string()),
  verification_hints: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const storyContextSchema = z.looseObject({
  storyId: mcpUuidSchema,
  storyTitle: z.string(),
  storyStatus: storyStatus,
  storySortOrder: z.number().int(),
  storyMapId: mcpUuidSchema,
  storyMapName: z.string(),
  storyMapDescription: nullableTextSchema,
  storyMapContextMarkdown: nullableTextSchema,
  activityId: mcpUuidSchema,
  activityName: z.string(),
  activityDescription: nullableTextSchema,
  activitySortOrder: z.number().int(),
  taskId: mcpUuidSchema,
  taskName: z.string(),
  taskDescription: nullableTextSchema,
  taskSortOrder: z.number().int(),
  releaseId: mcpUuidSchema.nullable(),
  releaseName: nullableTextSchema,
  releaseDescription: nullableTextSchema,
  releaseContextMarkdown: nullableTextSchema,
  releaseSortOrder: z.number().int().nullable(),
  userStory: z.string(),
  acceptanceCriteria: z.string(),
  edgeCases: nullableTextSchema,
  technicalGuidelines: nullableTextSchema,
  figmaLink: nullableTextSchema,
  personas: z.array(personaSummarySchema),
  agentGuidance: z.looseObject({
    riskFlags: z.array(z.string()),
    missingContext: z.array(z.string()),
    verificationFocus: z.array(z.string()),
    figma: z.looseObject({
      hasFigmaLink: z.boolean(),
      figmaLink: nullableTextSchema,
      recommendedNextStep: nullableTextSchema,
      recommendedTools: z.array(z.string()),
    }),
  }),
});
