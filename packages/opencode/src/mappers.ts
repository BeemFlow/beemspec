import type { OpenCodeSessionContext } from './types';

/**
 * Shape of a story row from the database, with only the fields needed
 * for session context mapping.
 */
export interface StoryContextRow {
  id: string;
  release_name?: string | null;
  title: string;
  activity_name?: string;
  task_name?: string;
  release_id?: string | null;
  content: {
    requirements?: string;
    acceptance_criteria?: string;
    edge_cases?: string | null;
    technical_guidelines?: string | null;
    figma_link?: string | null;
  };
}

/** Map a raw story row to the OpenCodeSessionContext shape. */
export function mapStoryToSessionContext(story: StoryContextRow): OpenCodeSessionContext {
  const content = story.content ?? {};
  return {
    releaseId: story.release_id ?? '',
    releaseName: story.release_name ?? null,
    storyId: story.id,
    storyTitle: story.title,
    activityName: story.activity_name ?? '',
    taskName: story.task_name ?? '',
    requirements: content.requirements ?? '',
    acceptanceCriteria: content.acceptance_criteria ?? '',
    edgeCases: content.edge_cases ?? null,
    technicalGuidelines: content.technical_guidelines ?? null,
    figmaLink: content.figma_link ?? null,
  };
}
