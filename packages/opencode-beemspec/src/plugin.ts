import type { OpenCodeSessionContext } from './types';

function compactedContextForStories(stories: OpenCodeSessionContext[]): string[] {
  if (stories.length === 0) return [];

  const lines: string[] = ['BeemSpec active stories:'];
  for (const story of stories) {
    lines.push('', `Story: ${story.storyTitle} (${story.storyId})`);
    lines.push(`Acceptance Criteria: ${story.acceptanceCriteria}`);
    if (story.technicalGuidelines) {
      lines.push(`Technical Guidelines: ${story.technicalGuidelines}`);
    }
  }
  return lines;
}

export { compactedContextForStories };
