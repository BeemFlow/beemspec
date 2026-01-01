import { NextResponse } from 'next/server';
import { z } from 'zod';

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Validates that a string is a valid UUID v4.
 */
export function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Returns a 400 response for invalid UUID in URL params.
 */
export function invalidIdResponse(): NextResponse {
  return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
}

/**
 * Removes undefined values from an object, preserving null.
 * Maintains type safety for partial updates.
 */
export function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// =============================================================================
// Validation Types & Helper
// =============================================================================

type ValidationSuccess<T> = { success: true; data: T };
type ValidationFailure = { success: false; response: NextResponse };
type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Safely parses request JSON and validates against a schema.
 * Handles both JSON parse errors and validation errors with proper 400 responses.
 */
export async function validateRequest<T>(request: Request, schema: z.ZodSchema<T>): Promise<ValidationResult<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      success: false,
      response: NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 }),
    };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json({ error: 'Validation failed', details: result.error.flatten() }, { status: 400 }),
    };
  }

  return { success: true, data: result.data };
}

// =============================================================================
// Shared Primitives
// =============================================================================

const uuid = z.string().uuid();
const nullableString = z.string().min(1).nullable();
const name = z.string().min(1, 'Required').max(200);
const sortOrder = z.number().int().min(0);

export const storyStatus = z.enum(['backlog', 'ready', 'in_progress', 'review', 'done']);

// Update schema helpers
const atLeastOneField = <T extends Record<string, unknown>>(data: T): boolean =>
  Object.values(data).some((v) => v !== undefined);
const atLeastOneFieldMessage = { message: 'At least one field must be provided' };

// =============================================================================
// Entity Base Schemas & CRUD Derivations
// =============================================================================

const storyMapBase = z.object({
  name,
  description: nullableString,
});

export const createStoryMapSchema = storyMapBase.partial({ description: true });

export const updateStoryMapSchema = storyMapBase.partial().refine(atLeastOneField, atLeastOneFieldMessage);

const releaseBase = z.object({
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

const activityBase = z.object({
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

const taskBase = z.object({
  activity_id: uuid,
  name,
  description: nullableString,
});

export const createTaskSchema = taskBase.partial({ description: true });

export const updateTaskSchema = taskBase
  .partial() // activity_id included: tasks can move between activities
  .extend({ sort_order: sortOrder.optional() })
  .refine(atLeastOneField, atLeastOneFieldMessage);

export const reorderTasksSchema = z.object({
  activity_id: uuid,
  order: z.array(uuid).min(1, 'Order array cannot be empty'),
});

const storyBase = z.object({
  task_id: uuid,
  release_id: uuid.nullable(),
  title: z.string().min(1, 'Required').max(500),
  requirements: z.string().min(1, 'Required'),
  acceptance_criteria: z.string().min(1, 'Required'),
  figma_link: z.url().nullable(),
  edge_cases: nullableString,
  technical_guidelines: nullableString,
  status: storyStatus,
});

export const createStorySchema = storyBase
  .partial({
    release_id: true,
    figma_link: true,
    edge_cases: true,
    technical_guidelines: true,
    status: true,
  })
  .extend({ status: storyStatus.optional().default('backlog') });

export const updateStorySchema = storyBase
  .partial() // task_id included: stories can move between tasks
  .extend({ sort_order: sortOrder.optional() })
  .refine(atLeastOneField, atLeastOneFieldMessage);

export const reorderStoriesSchema = z.object({
  task_id: uuid,
  release_id: uuid.nullable(),
  order: z.array(uuid).min(1, 'Order array cannot be empty'),
});

const personaBase = z.object({
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

// Type Exports
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

export type CreateStory = z.infer<typeof createStorySchema>;
export type UpdateStory = z.infer<typeof updateStorySchema>;
export type ReorderStories = z.infer<typeof reorderStoriesSchema>;

export type CreatePersona = z.infer<typeof createPersonaSchema>;
export type UpdatePersona = z.infer<typeof updatePersonaSchema>;

export { storyBase, taskBase, activityBase, personaBase, releaseBase, storyMapBase };
