import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const uuid = z.string().uuid();
const nullableString = z.string().min(1).nullable();
const name = z.string().min(1, 'Required').max(200);

const atLeastOneField = <T extends Record<string, unknown>>(data: T): boolean =>
  Object.values(data).some((value) => value !== undefined);
const atLeastOneFieldMessage = { message: 'At least one field must be provided' };

// ---------------------------------------------------------------------------
// Story status — single source of truth (derive the TS type via z.infer)
// ---------------------------------------------------------------------------

export const storyStatus = z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'done']);

// ---------------------------------------------------------------------------
// Story content — structured spec fields stored as JSON
// ---------------------------------------------------------------------------

export const storyContentSchema = z
  .object({
    _version: z.literal(1).optional().default(1),
    user_story: z.string().min(1, 'Required'),
    acceptance_criteria: z.string().min(1, 'Required'),
    figma_link: z.url().nullable().optional(),
    edge_cases: nullableString.optional(),
    technical_guidelines: nullableString.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Story map
// ---------------------------------------------------------------------------

export const storyMapBase = z
  .object({
    team_id: uuid,
    name,
    description: nullableString,
    context_markdown: nullableString,
  })
  .strict();

export const createStoryMapSchema = storyMapBase.partial({ description: true, context_markdown: true });

const updateStoryMapFieldsSchema = storyMapBase.omit({ team_id: true }).partial().strict();

export const updateStoryMapSchema = updateStoryMapFieldsSchema.refine(atLeastOneField, atLeastOneFieldMessage);

export const updateStoryMapToolSchema = updateStoryMapFieldsSchema
  .extend({ story_map_id: uuid })
  .refine(({ story_map_id: _storyMapId, ...changes }) => atLeastOneField(changes), atLeastOneFieldMessage);

// ---------------------------------------------------------------------------
// Release
// ---------------------------------------------------------------------------

export const releaseBase = z
  .object({
    story_map_id: uuid,
    name,
    description: nullableString,
    context_markdown: nullableString,
  })
  .strict();

export const createReleaseSchema = releaseBase.partial({ description: true, context_markdown: true });

const updateReleaseFieldsSchema = releaseBase.omit({ story_map_id: true }).partial().strict();

export const updateReleaseSchema = updateReleaseFieldsSchema.refine(atLeastOneField, atLeastOneFieldMessage);

export const updateReleaseToolSchema = updateReleaseFieldsSchema
  .extend({ release_id: uuid })
  .refine(({ release_id: _releaseId, ...changes }) => atLeastOneField(changes), atLeastOneFieldMessage);

export const reorderReleasesSchema = z
  .object({
    story_map_id: uuid,
    order: z.array(uuid).min(1, 'Order array cannot be empty'),
  })
  .strict();

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export const activityBase = z
  .object({
    story_map_id: uuid,
    name,
    description: nullableString,
  })
  .strict();

export const createActivitySchema = activityBase.partial({ description: true });

const updateActivityFieldsSchema = activityBase.omit({ story_map_id: true }).partial().strict();

export const updateActivitySchema = updateActivityFieldsSchema.refine(atLeastOneField, atLeastOneFieldMessage);

export const updateActivityToolSchema = updateActivityFieldsSchema
  .extend({ activity_id: uuid })
  .refine(({ activity_id: _activityId, ...changes }) => atLeastOneField(changes), atLeastOneFieldMessage);

export const reorderActivitiesSchema = z
  .object({
    story_map_id: uuid,
    order: z.array(uuid).min(1, 'Order array cannot be empty'),
  })
  .strict();

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export const taskBase = z
  .object({
    activity_id: uuid,
    name,
    description: nullableString,
  })
  .strict();

export const createTaskSchema = taskBase.partial({ description: true });

const updateTaskFieldsSchema = taskBase.omit({ activity_id: true }).partial().strict();

export const updateTaskSchema = updateTaskFieldsSchema.refine(atLeastOneField, atLeastOneFieldMessage);

export const updateTaskToolSchema = updateTaskFieldsSchema
  .extend({ task_id: uuid })
  .refine(({ task_id: _taskId, ...changes }) => atLeastOneField(changes), atLeastOneFieldMessage);

export const reorderTasksSchema = z
  .object({
    activity_id: uuid,
    order: z.array(uuid).min(1, 'Order array cannot be empty'),
  })
  .strict();

export const moveTaskSchema = z
  .object({
    target_activity_id: uuid,
    target_order: z.array(uuid).min(1, 'Order array cannot be empty'),
  })
  .strict();

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

export const storyBase = z
  .object({
    task_id: uuid,
    release_id: uuid.nullable(),
    title: z.string().min(1, 'Required').max(500),
    content: storyContentSchema,
    status: storyStatus,
  })
  .strict();

export const createStorySchema = storyBase
  .partial({
    release_id: true,
    status: true,
  })
  .extend({ status: storyStatus.optional().default('backlog') });

const updateStoryFieldsSchema = storyBase.omit({ task_id: true, release_id: true }).partial().strict();

export const updateStorySchema = updateStoryFieldsSchema.refine(atLeastOneField, atLeastOneFieldMessage);

export const updateStoryToolSchema = updateStoryFieldsSchema
  .extend({ story_id: uuid })
  .refine(({ story_id: _storyId, ...changes }) => atLeastOneField(changes), atLeastOneFieldMessage);

export const reorderStoriesSchema = z
  .object({
    task_id: uuid,
    release_id: uuid.nullable(),
    order: z.array(uuid).min(1, 'Order array cannot be empty'),
  })
  .strict();

export const moveStorySchema = z
  .object({
    target_task_id: uuid,
    target_release_id: uuid.nullable(),
    target_order: z.array(uuid).min(1, 'Order array cannot be empty'),
  })
  .strict();

// ---------------------------------------------------------------------------
// Persona
// ---------------------------------------------------------------------------

export const personaBase = z
  .object({
    story_map_id: uuid,
    name,
    description: nullableString,
    goals: nullableString,
  })
  .strict();

export const createPersonaSchema = personaBase.partial({
  description: true,
  goals: true,
});

const updatePersonaFieldsSchema = personaBase.omit({ story_map_id: true }).partial().strict();

export const updatePersonaSchema = updatePersonaFieldsSchema.refine(atLeastOneField, atLeastOneFieldMessage);

export const updatePersonaToolSchema = updatePersonaFieldsSchema
  .extend({ persona_id: uuid })
  .refine(({ persona_id: _personaId, ...changes }) => atLeastOneField(changes), atLeastOneFieldMessage);

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
