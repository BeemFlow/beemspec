import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const MAX_TEXT_LENGTH = 20_000;
const MAX_MARKDOWN_LENGTH = 100_000;
const MAX_ORDER_ITEMS = 1_000;

const uuid = (description: string) => z.string().uuid().describe(description);
const nullableText = (description: string, max = MAX_TEXT_LENGTH) =>
  z.string().min(1).max(max).nullable().describe(`${description} Pass null to clear it.`);
const name = (description: string) => z.string().min(1, 'Required').max(200).describe(description);
const uniqueUuidOrder = (description: string, itemDescription: string) =>
  z
    .array(uuid(itemDescription))
    .min(1, 'Order array cannot be empty')
    .max(MAX_ORDER_ITEMS, `Order cannot contain more than ${MAX_ORDER_ITEMS} IDs`)
    .refine((ids) => new Set(ids).size === ids.length, 'Order must not contain duplicate IDs')
    .describe(description);

const atLeastOneField = <T extends Record<string, unknown>>(data: T): boolean =>
  Object.values(data).some((value) => value !== undefined);
const atLeastOneFieldMessage = { message: 'At least one field must be provided' };
const updateDescription = (entity: string) => `Fields to change for the ${entity}; at least one change is required.`;

// ---------------------------------------------------------------------------
// Story status — single source of truth (derive the TS type via z.infer)
// ---------------------------------------------------------------------------

export const storyStatus = z
  .enum(['backlog', 'todo', 'in_progress', 'in_review', 'done'])
  .describe('Story workflow status.');

// ---------------------------------------------------------------------------
// Story content — structured spec fields stored as JSON
// ---------------------------------------------------------------------------

export const storyContentSchema = z
  .object({
    _version: z.literal(1).optional().default(1).describe('Story content schema version; currently 1.'),
    user_story: z
      .string()
      .min(1, 'Required')
      .max(MAX_MARKDOWN_LENGTH)
      .describe('User-centered story statement, including the actor, desired capability, and outcome.'),
    acceptance_criteria: z
      .string()
      .min(1, 'Required')
      .max(MAX_MARKDOWN_LENGTH)
      .describe('Testable acceptance criteria, preferably as concise Markdown.'),
    figma_link: z.url().max(2_048).nullable().optional().describe('Related Figma design URL. Pass null to clear it.'),
    edge_cases: nullableText('Known edge cases and exceptional behavior.').optional(),
    technical_guidelines: nullableText('Implementation constraints or technical guidance.').optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Story map
// ---------------------------------------------------------------------------

export const storyMapBase = z
  .object({
    team_id: uuid('Team UUID that owns the story map.'),
    name: name('Human-readable story map name.'),
    description: nullableText('Short story map description.'),
    context_markdown: nullableText(
      'Long-form Markdown product context, decisions, constraints, and links for agents.',
      MAX_MARKDOWN_LENGTH,
    ),
  })
  .strict();

export const createStoryMapSchema = storyMapBase.partial({ description: true, context_markdown: true });

const updateStoryMapFieldsSchema = storyMapBase.omit({ team_id: true }).partial().strict();

export const updateStoryMapSchema = updateStoryMapFieldsSchema
  .refine(atLeastOneField, atLeastOneFieldMessage)
  .describe(updateDescription('story map'));

export const updateStoryMapToolSchema = updateStoryMapFieldsSchema
  .extend({ story_map_id: uuid('Story map UUID to update.') })
  .refine(({ story_map_id: _storyMapId, ...changes }) => atLeastOneField(changes), atLeastOneFieldMessage)
  .describe(updateDescription('story map'));

// ---------------------------------------------------------------------------
// Release
// ---------------------------------------------------------------------------

export const releaseBase = z
  .object({
    story_map_id: uuid('Story map UUID that owns the release.'),
    name: name('Human-readable release name.'),
    description: nullableText('Short release description.'),
    context_markdown: nullableText(
      'Long-form Markdown release scope, decisions, constraints, and links for agents.',
      MAX_MARKDOWN_LENGTH,
    ),
  })
  .strict();

export const createReleaseSchema = releaseBase.partial({ description: true, context_markdown: true });

const updateReleaseFieldsSchema = releaseBase.omit({ story_map_id: true }).partial().strict();

export const updateReleaseSchema = updateReleaseFieldsSchema
  .refine(atLeastOneField, atLeastOneFieldMessage)
  .describe(updateDescription('release'));

export const updateReleaseToolSchema = updateReleaseFieldsSchema
  .extend({ release_id: uuid('Release UUID to update.') })
  .refine(({ release_id: _releaseId, ...changes }) => atLeastOneField(changes), atLeastOneFieldMessage)
  .describe(updateDescription('release'));

export const reorderReleasesSchema = z
  .object({
    story_map_id: uuid('Story map UUID whose releases will be reordered.'),
    order: uniqueUuidOrder(
      'Complete final ordering of every release UUID in the story map.',
      'Release UUID in final display order.',
    ),
  })
  .strict();

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export const activityBase = z
  .object({
    story_map_id: uuid('Story map UUID that owns the activity.'),
    name: name('Human-readable activity name.'),
    description: nullableText('Short activity description.'),
  })
  .strict();

export const createActivitySchema = activityBase.partial({ description: true });

const updateActivityFieldsSchema = activityBase.omit({ story_map_id: true }).partial().strict();

export const updateActivitySchema = updateActivityFieldsSchema
  .refine(atLeastOneField, atLeastOneFieldMessage)
  .describe(updateDescription('activity'));

export const updateActivityToolSchema = updateActivityFieldsSchema
  .extend({ activity_id: uuid('Activity UUID to update.') })
  .refine(({ activity_id: _activityId, ...changes }) => atLeastOneField(changes), atLeastOneFieldMessage)
  .describe(updateDescription('activity'));

export const reorderActivitiesSchema = z
  .object({
    story_map_id: uuid('Story map UUID whose activities will be reordered.'),
    order: uniqueUuidOrder(
      'Complete final ordering of every activity UUID in the story map.',
      'Activity UUID in final display order.',
    ),
  })
  .strict();

// ---------------------------------------------------------------------------
// Task
// ---------------------------------------------------------------------------

export const taskBase = z
  .object({
    activity_id: uuid('Activity UUID that owns the task.'),
    name: name('Human-readable task name.'),
    description: nullableText('Short task description.'),
  })
  .strict();

export const createTaskSchema = taskBase.partial({ description: true });

const updateTaskFieldsSchema = taskBase.omit({ activity_id: true }).partial().strict();

export const updateTaskSchema = updateTaskFieldsSchema
  .refine(atLeastOneField, atLeastOneFieldMessage)
  .describe(updateDescription('task'));

export const updateTaskToolSchema = updateTaskFieldsSchema
  .extend({ task_id: uuid('Task UUID to update.') })
  .refine(({ task_id: _taskId, ...changes }) => atLeastOneField(changes), atLeastOneFieldMessage)
  .describe(updateDescription('task'));

export const reorderTasksSchema = z
  .object({
    activity_id: uuid('Activity UUID whose tasks will be reordered.'),
    order: uniqueUuidOrder(
      'Complete final ordering of every task UUID in the activity.',
      'Task UUID in final display order.',
    ),
  })
  .strict();

export const moveTaskSchema = z
  .object({
    target_activity_id: uuid('Destination activity UUID.'),
    target_order: uniqueUuidOrder(
      'Complete final task ordering for the destination activity, including the moved task exactly once.',
      'Task UUID in destination display order.',
    ),
  })
  .strict();

// ---------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------

export const storyBase = z
  .object({
    task_id: uuid('Task UUID that owns the story.'),
    release_id: uuid('Release UUID for the story; null places it in the backlog.').nullable(),
    title: z.string().min(1, 'Required').max(500).describe('Concise story title.'),
    content: storyContentSchema.describe('Structured implementation specification for the story.'),
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

export const updateStorySchema = updateStoryFieldsSchema
  .refine(atLeastOneField, atLeastOneFieldMessage)
  .describe(updateDescription('story'));

export const updateStoryToolSchema = updateStoryFieldsSchema
  .extend({ story_id: uuid('Story UUID to update.') })
  .refine(({ story_id: _storyId, ...changes }) => atLeastOneField(changes), atLeastOneFieldMessage)
  .describe(updateDescription('story'));

export const reorderStoriesSchema = z
  .object({
    task_id: uuid('Task UUID containing the story cell.'),
    release_id: uuid('Release UUID for the story cell; null identifies the backlog.').nullable(),
    order: uniqueUuidOrder(
      'Complete final ordering of every story UUID in this task and release cell.',
      'Story UUID in final display order.',
    ),
  })
  .strict();

export const moveStorySchema = z
  .object({
    target_task_id: uuid('Destination task UUID.'),
    target_release_id: uuid('Destination release UUID; null moves the story to the backlog.').nullable(),
    target_order: uniqueUuidOrder(
      'Complete final story ordering for the destination cell, including the moved story exactly once.',
      'Story UUID in destination display order.',
    ),
  })
  .strict();

// ---------------------------------------------------------------------------
// Persona
// ---------------------------------------------------------------------------

export const personaBase = z
  .object({
    story_map_id: uuid('Story map UUID that owns the persona.'),
    name: name('Human-readable persona name.'),
    description: nullableText('Persona characteristics, needs, and context.'),
    goals: nullableText('Persona goals and desired outcomes.'),
  })
  .strict();

export const createPersonaSchema = personaBase.partial({
  description: true,
  goals: true,
});

const updatePersonaFieldsSchema = personaBase.omit({ story_map_id: true }).partial().strict();

export const updatePersonaSchema = updatePersonaFieldsSchema
  .refine(atLeastOneField, atLeastOneFieldMessage)
  .describe(updateDescription('persona'));

export const updatePersonaToolSchema = updatePersonaFieldsSchema
  .extend({ persona_id: uuid('Persona UUID to update.') })
  .refine(({ persona_id: _personaId, ...changes }) => atLeastOneField(changes), atLeastOneFieldMessage)
  .describe(updateDescription('persona'));

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
