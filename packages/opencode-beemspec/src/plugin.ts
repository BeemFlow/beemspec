import type { OpenCodeSessionContext } from './types';

function compactedContext(context: OpenCodeSessionContext): string[] {
  return [
    `Release ID: ${context.releaseId}`,
    `Story ID: ${context.storyId}`,
    `Story Title: ${context.storyTitle}`,
    `Acceptance Criteria: ${context.acceptanceCriteria}`,
  ];
}

export { compactedContext };
