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

function normalize(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

export function getLinearStorySyncTargetFromEnv(): LinearStorySyncTarget | null {
  const teamId = normalize(process.env.BEEMSPEC_LINEAR_DEFAULT_TEAM_ID);
  if (!teamId) return null;

  return {
    teamId,
    projectId: normalize(process.env.BEEMSPEC_LINEAR_DEFAULT_PROJECT_ID) ?? undefined,
    stateId: normalize(process.env.BEEMSPEC_LINEAR_DEFAULT_STATE_ID) ?? undefined,
  };
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
): Promise<LinearIssueSnapshot | null> {
  if (!linearIssueSync) return null;

  const target = getLinearStorySyncTargetFromEnv();
  if (!target) return null;

  return linearIssueSync.createIssue(mapStoryToLinearIssueInput(story, target));
}
