import type { OpenCodeSessionContext } from './types';

/**
 * Shape of a story row from the database, with only the fields needed
 * for session context mapping.
 */
export interface StoryContextRow {
  id: string;
  title: string;
  release_id?: string | null;
  content: {
    requirements?: string;
    acceptance_criteria?: string;
    technical_guidelines?: string | null;
  };
}

/** Map a raw story row to the OpenCodeSessionContext shape. */
export function mapStoryToSessionContext(story: StoryContextRow): OpenCodeSessionContext {
  const content = story.content ?? {};
  return {
    releaseId: story.release_id ?? '',
    storyId: story.id,
    storyTitle: story.title,
    requirements: content.requirements ?? '',
    acceptanceCriteria: content.acceptance_criteria ?? '',
    technicalGuidelines: content.technical_guidelines ?? null,
  };
}
