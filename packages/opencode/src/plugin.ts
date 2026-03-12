import type { OpenCodeSessionContext } from './types';

function compactedContextForStories(stories: OpenCodeSessionContext[]): string[] {
  if (stories.length === 0) return [];

  const lines: string[] = ['BeemSpec active stories:'];
  for (const story of stories) {
    lines.push('', `Story: ${story.storyTitle} (${story.storyId})`);
    if (story.releaseName || story.activityName || story.taskName) {
      lines.push(
        `Placement: release=${story.releaseName ?? 'backlog'}, activity=${story.activityName || 'unknown'}, task=${story.taskName || 'unknown'}`,
      );
    }
    if (story.userStory) {
      lines.push(`User Story: ${story.userStory}`);
    }
    lines.push(`Acceptance Criteria: ${story.acceptanceCriteria}`);
    if (story.edgeCases) {
      lines.push(`Edge Cases: ${story.edgeCases}`);
    }
    if (story.technicalGuidelines) {
      lines.push(`Technical Guidelines: ${story.technicalGuidelines}`);
    }
    if (story.figmaLink) {
      lines.push(`Figma: ${story.figmaLink}`);
      lines.push('Design Hint: If Figma MCP is connected, fetch design context before implementing UI changes.');
    }
  }
  return lines;
}

export { compactedContextForStories };
