import type { LinearIssueSnapshot, LinearIssueSyncPort, LinearIssueUpsertInput } from '@/integrations/linear/contracts';

export interface StoryForLinearSync {
  id: string;
  title: string;
  requirements: string;
  acceptance_criteria: string;
  edge_cases: string | null;
  technical_guidelines: string | null;
  figma_link: string | null;
  status: string;
}

export interface LinearStorySyncTarget {
  teamId: string;
  projectId?: string;
  stateId?: string;
}

function section(title: string, body: string | null): string | null {
  if (!body) return null;
  return `## ${title}\n${body}`;
}

function buildDescription(story: StoryForLinearSync): string {
  const parts = [
    section('Requirements', story.requirements),
    section('Acceptance Criteria', story.acceptance_criteria),
    section('Status', story.status),
    section('Figma', story.figma_link),
    section('Edge Cases', story.edge_cases),
    section('Technical Guidelines', story.technical_guidelines),
    section('BeemSpec Story ID', story.id),
  ].filter((value): value is string => Boolean(value));

  return parts.join('\n\n');
}

export function mapStoryToLinearIssueInput(
  story: StoryForLinearSync,
  target: LinearStorySyncTarget,
): LinearIssueUpsertInput {
  return {
    title: story.title,
    description: buildDescription(story),
    teamId: target.teamId,
    projectId: target.projectId,
    stateId: target.stateId,
  };
}

export async function syncNewStoryToLinear(
  story: StoryForLinearSync,
  linearIssueSync: LinearIssueSyncPort | null,
  target: LinearStorySyncTarget | null,
): Promise<LinearIssueSnapshot | null> {
  return syncStoryToLinear(story, linearIssueSync, null, target);
}

export async function syncStoryToLinear(
  story: StoryForLinearSync,
  linearIssueSync: LinearIssueSyncPort | null,
  linearIssueId: string | null,
  target: LinearStorySyncTarget | null,
): Promise<LinearIssueSnapshot | null> {
  if (!linearIssueSync) return null;

  if (!target) return null;

  const input = mapStoryToLinearIssueInput(story, target);
  if (!linearIssueId) {
    return linearIssueSync.createIssue(input);
  }

  const { teamId: _teamId, ...updateInput } = input;
  return linearIssueSync.updateIssue(linearIssueId, updateInput);
}
