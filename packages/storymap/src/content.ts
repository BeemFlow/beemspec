import type { StoryContent } from './types';

// ---------------------------------------------------------------------------
// Content defaults & helpers
// ---------------------------------------------------------------------------

/** Current content schema version. */
export const CONTENT_VERSION = 1 as const;

/** Create empty StoryContent with required fields and current version. */
export function emptyContent(): StoryContent {
  return {
    _version: CONTENT_VERSION,
    requirements: '',
    acceptance_criteria: '',
  };
}

/** Create StoryContent from partial input, filling defaults. */
export function createContent(input: Omit<StoryContent, '_version'> & { _version?: number }): StoryContent {
  return {
    _version: CONTENT_VERSION,
    requirements: input.requirements,
    acceptance_criteria: input.acceptance_criteria,
    figma_link: input.figma_link ?? null,
    edge_cases: input.edge_cases ?? null,
    technical_guidelines: input.technical_guidelines ?? null,
  };
}

/** Type guard for StoryContent. */
export function isStoryContent(value: unknown): value is StoryContent {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj._version === 'number' &&
    typeof obj.requirements === 'string' &&
    typeof obj.acceptance_criteria === 'string'
  );
}
