import { z } from 'zod'
import { NextResponse } from 'next/server'

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Validates that a string is a valid UUID v4.
 */
export function isValidUuid(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(id)
}

/**
 * Returns a 400 response for invalid UUID in URL params.
 */
export function invalidIdResponse(): NextResponse {
  return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 })
}

/**
 * Removes undefined values from an object, preserving null.
 * Maintains type safety for partial updates.
 */
export function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>
}

// =============================================================================
// Validation Types & Helper
// =============================================================================

type ValidationSuccess<T> = { success: true; data: T }
type ValidationFailure = { success: false; response: NextResponse }
type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure

/**
 * Safely parses request JSON and validates against a schema.
 * Handles both JSON parse errors and validation errors with proper 400 responses.
 */
export async function validateRequest<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<ValidationResult<T>> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      ),
    }
  }

  const result = schema.safeParse(body)
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Validation failed', details: result.error.flatten() },
        { status: 400 }
      ),
    }
  }

  return { success: true, data: result.data }
}

// =============================================================================
// Common Schema Primitives
// =============================================================================

const uuid = z.string().uuid()

// String that must be non-empty if provided, but can be null
const nullableString = z.string().min(1).nullable()

// For status enum
export const storyStatus = z.enum(['backlog', 'ready', 'in_progress', 'review', 'done'])

// Refinement to ensure at least one field is provided for updates
const atLeastOneField = <T extends Record<string, unknown>>(data: T): boolean =>
  Object.values(data).some(v => v !== undefined)

const atLeastOneFieldMessage = { message: 'At least one field must be provided' }

// =============================================================================
// Story Map Schemas
// =============================================================================

export const createStoryMapSchema = z.object({
  name: z.string().min(1, 'Required').max(200),
  description: nullableString.optional(),
})

export const updateStoryMapSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: nullableString.optional(),
}).refine(atLeastOneField, atLeastOneFieldMessage)

// =============================================================================
// Release Schemas
// =============================================================================

export const createReleaseSchema = z.object({
  story_map_id: uuid,
  name: z.string().min(1, 'Required').max(200),
  description: nullableString.optional(),
})

export const updateReleaseSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: nullableString.optional(),
  sort_order: z.number().int().min(0).optional(),
}).refine(atLeastOneField, atLeastOneFieldMessage)

export const reorderReleasesSchema = z.object({
  story_map_id: uuid,
  order: z.array(uuid).min(1, 'Order array cannot be empty'),
})

// =============================================================================
// Activity Schemas
// =============================================================================

export const createActivitySchema = z.object({
  story_map_id: uuid,
  name: z.string().min(1, 'Required').max(200),
  description: nullableString.optional(),
})

export const updateActivitySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: nullableString.optional(),
  sort_order: z.number().int().min(0).optional(),
}).refine(atLeastOneField, atLeastOneFieldMessage)

export const reorderActivitiesSchema = z.object({
  story_map_id: uuid,
  order: z.array(uuid).min(1, 'Order array cannot be empty'),
})

// =============================================================================
// Task Schemas
// =============================================================================

export const createTaskSchema = z.object({
  activity_id: uuid,
  name: z.string().min(1, 'Required').max(200),
  description: nullableString.optional(),
})

export const updateTaskSchema = z.object({
  activity_id: uuid.optional(),
  name: z.string().min(1).max(200).optional(),
  description: nullableString.optional(),
  sort_order: z.number().int().min(0).optional(),
}).refine(atLeastOneField, atLeastOneFieldMessage)

export const reorderTasksSchema = z.object({
  activity_id: uuid,
  order: z.array(uuid).min(1, 'Order array cannot be empty'),
})

// =============================================================================
// Story Schemas
// =============================================================================

export const createStorySchema = z.object({
  task_id: uuid,
  release_id: uuid.nullable().optional(),
  title: z.string().min(1, 'Required').max(500),
  requirements: z.string().min(1, 'Required'),
  acceptance_criteria: z.string().min(1, 'Required'),
  figma_link: z.string().url().nullable().optional(),
  edge_cases: nullableString.optional(),
  technical_guidelines: nullableString.optional(),
  status: storyStatus.optional().default('backlog'),
})

export const updateStorySchema = z.object({
  task_id: uuid.optional(),
  release_id: uuid.nullable().optional(),
  title: z.string().min(1).max(500).optional(),
  requirements: z.string().min(1).optional(),
  acceptance_criteria: z.string().min(1).optional(),
  figma_link: z.string().url().nullable().optional(),
  edge_cases: nullableString.optional(),
  technical_guidelines: nullableString.optional(),
  status: storyStatus.optional(),
  sort_order: z.number().int().min(0).optional(),
}).refine(atLeastOneField, atLeastOneFieldMessage)

export const reorderStoriesSchema = z.object({
  task_id: uuid,
  release_id: uuid.nullable(),
  order: z.array(uuid).min(1, 'Order array cannot be empty'),
})

// =============================================================================
// Persona Schemas
// =============================================================================

export const createPersonaSchema = z.object({
  story_map_id: uuid,
  name: z.string().min(1, 'Required').max(200),
  description: nullableString.optional(),
  goals: nullableString.optional(),
})

export const updatePersonaSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: nullableString.optional(),
  goals: nullableString.optional(),
  sort_order: z.number().int().min(0).optional(),
}).refine(atLeastOneField, atLeastOneFieldMessage)

// =============================================================================
// Type Exports (inferred from schemas)
// =============================================================================

export type CreateStoryMap = z.infer<typeof createStoryMapSchema>
export type UpdateStoryMap = z.infer<typeof updateStoryMapSchema>

export type CreateRelease = z.infer<typeof createReleaseSchema>
export type UpdateRelease = z.infer<typeof updateReleaseSchema>
export type ReorderReleases = z.infer<typeof reorderReleasesSchema>

export type CreateActivity = z.infer<typeof createActivitySchema>
export type UpdateActivity = z.infer<typeof updateActivitySchema>
export type ReorderActivities = z.infer<typeof reorderActivitiesSchema>

export type CreateTask = z.infer<typeof createTaskSchema>
export type UpdateTask = z.infer<typeof updateTaskSchema>
export type ReorderTasks = z.infer<typeof reorderTasksSchema>

export type CreateStory = z.infer<typeof createStorySchema>
export type UpdateStory = z.infer<typeof updateStorySchema>
export type ReorderStories = z.infer<typeof reorderStoriesSchema>

export type CreatePersona = z.infer<typeof createPersonaSchema>
export type UpdatePersona = z.infer<typeof updatePersonaSchema>
