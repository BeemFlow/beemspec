import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const uuid = z.string().uuid();
const nullableString = z.string().min(1).nullable();
const name = z.string().min(1, 'Required').max(200);
const sortOrder = z.number().int().min(0);

const atLeastOneField = <T extends Record<string, unknown>>(data: T): boolean =>
  Object.values(data).some((value) => value !== undefined);
const atLeastOneFieldMessage = { message: 'At least one field must be provided' };

// ---------------------------------------------------------------------------
// Story status — single source of truth (derive the TS type via z.infer)
// ---------------------------------------------------------------------------

export const storyStatus = z.enum(['backlog', 'ready', 'in_progress', 'review', 'done']);

// ---------------------------------------------------------------------------
// Story content — structured spec fields stored as JSON
// ---------------------------------------------------------------------------

export const storyContentSchema = z.object({
  _version: z.literal(1).optional().default(1),
  requirements: z.string().min(1, 'Required'),
  acceptance_criteria: z.string().min(1, 'Required'),
  figma_link: z.url().nullable().optional(),
  edge_cases: nullableString.optional(),
  technical_guidelines: nullableString.optional(),
});

// ---------------------------------------------------------------------------
// Story map
// ---------------------------------------------------------------------------

export const storyMapBase = z.object({
  team_id: uuid,
  name,
  description: nullableString,
});

export const createStoryMapSchema = storyMapBase.partial({ description: true });

export const updateStoryMapSchema = storyMapBase
  .omit({ team_id: true })
  .partial()
  .refine(atLeastOneField, atLeastOneFieldMessage);

// ---------------------------------------------------------------------------
// Release
// ---------------------------------------------------------------------------

export const releaseBase = z.object({
  story_map_id: uuid,
  name,
  description: nullableString,
});

export const createReleaseSchema = releaseBase.partial({ description: true });

export const updateReleaseSchema = releaseBase
  .omit({ story_map_id: true })
  .partial()
  .extend({ sort_order: sortOrder.optional() })
  .refine(atLeastOneField, atLeastOneFieldMessage);

export const reorderReleasesSchema = z.object({
  story_map_id: uuid,
  order: z.array(uuid).min(1, 'Order array cannot be empty'),
});

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export const activityBase = z.object({
  story_map_id: uuid,
  name,
  description: nullableString,
});

export const createActivitySchema = activityBase.partial({ description: true });

export const updateActivitySchema = activityBase
  .omit({ story_map_id: true })
  .partial()
  .extend({ sort_order: sortOrder.optional() })
  .refine(atLeastOneField, atLeastOneFieldMessage);

export const reorderActivitiesSchema = z.object({
  story_map_id: uuid,
  order: z.array(uuid).min(1, 'Order array cannot be empty'),
});

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export const taskBase = z.object({
  activity_id: uuid,
  name,
  description: nullableString,
});

export const createTaskSchema = taskBase.partial({ description: true });

export const updateTaskSchema = taskBase
  .partial()
  .extend({ sort_order: sortOrder.optional() })
  .refine(atLeastOneField, atLeastOneFieldMessage);

export const reorderTasksSchema = z.object({
  activity_id: uuid,
  order: z.array(uuid).min(1, 'Order array cannot be empty'),
});

export const moveTaskSchema = z.object({
  target_activity_id: uuid,
  target_order: z.array(uuid).min(1, 'Order array cannot be empty'),
});

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

export const storyBase = z.object({
  task_id: uuid,
  release_id: uuid.nullable(),
  title: z.string().min(1, 'Required').max(500),
  content: storyContentSchema,
  status: storyStatus,
});

export const createStorySchema = storyBase
  .partial({
    release_id: true,
    status: true,
  })
  .extend({ status: storyStatus.optional().default('backlog') });

export const updateStorySchema = storyBase
  .partial()
  .extend({ sort_order: sortOrder.optional() })
  .refine(atLeastOneField, atLeastOneFieldMessage);

export const reorderStoriesSchema = z.object({
  task_id: uuid,
  release_id: uuid.nullable(),
  order: z.array(uuid).min(1, 'Order array cannot be empty'),
});

export const moveStorySchema = z.object({
  target_task_id: uuid,
  target_release_id: uuid.nullable(),
  target_order: z.array(uuid).min(1, 'Order array cannot be empty'),
});

// ---------------------------------------------------------------------------
// Persona
// ---------------------------------------------------------------------------

export const personaBase = z.object({
  story_map_id: uuid,
  name,
  description: nullableString,
  goals: nullableString,
});

export const createPersonaSchema = personaBase.partial({
  description: true,
  goals: true,
});

export const updatePersonaSchema = personaBase
  .omit({ story_map_id: true })
  .partial()
  .extend({ sort_order: sortOrder.optional() })
  .refine(atLeastOneField, atLeastOneFieldMessage);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type CreateStoryMap = z.infer<typeof createStoryMapSchema>;
export type UpdateStoryMap = z.infer<typeof updateStoryMapSchema>;

export type CreateRelease = z.infer<typeof createReleaseSchema>;
export type UpdateRelease = z.infer<typeof updateReleaseSchema>;
export type ReorderReleases = z.infer<typeof reorderReleasesSchema>;

export type CreateActivity = z.infer<typeof createActivitySchema>;
export type UpdateActivity = z.infer<typeof updateActivitySchema>;
export type ReorderActivities = z.infer<typeof reorderActivitiesSchema>;

export type CreateTask = z.infer<typeof createTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
export type ReorderTasks = z.infer<typeof reorderTasksSchema>;
export type MoveTask = z.infer<typeof moveTaskSchema>;

export type CreateStory = z.infer<typeof createStorySchema>;
export type UpdateStory = z.infer<typeof updateStorySchema>;
export type ReorderStories = z.infer<typeof reorderStoriesSchema>;
export type MoveStory = z.infer<typeof moveStorySchema>;

export type CreatePersona = z.infer<typeof createPersonaSchema>;
export type UpdatePersona = z.infer<typeof updatePersonaSchema>;
