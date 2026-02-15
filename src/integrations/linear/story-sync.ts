import type { LinearIssueSnapshot, LinearIssueSync, LinearIssueUpsertInput } from '@/integrations/linear/types';

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

export type StoryStatus = 'backlog' | 'ready' | 'in_progress' | 'review' | 'done';

function section(title: string, body: string | null): string | null {
  if (!body) return null;
  return `## ${title}\n${body}`;
}

function normalizeStatusCandidate(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, '_');
}

export function mapLinearStatusToStoryStatus(value: string | null): StoryStatus | null {
  if (!value) return null;
  const normalized = normalizeStatusCandidate(value);

  if (['backlog', 'todo'].includes(normalized)) return 'backlog';
  if (['ready', 'planned'].includes(normalized)) return 'ready';
  if (['in_progress', 'started', 'inprogress'].includes(normalized)) return 'in_progress';
  if (['review', 'in_review'].includes(normalized)) return 'review';
  if (['done', 'complete', 'completed', 'canceled', 'cancelled'].includes(normalized)) return 'done';
  return null;
}

function sectionBody(description: string, title: string): string | null {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`## ${escapedTitle}\\n([\\s\\S]*?)(?=\\n\\n## |$)`);
  const match = description.match(pattern);
  if (!match) return null;
  const body = match[1].trim();
  return body.length > 0 ? body : null;
}

export function parseLinearDescriptionToStoryFields(description: string | null): Partial<StoryForLinearSync> {
  if (!description) return {};

  const requirements = sectionBody(description, 'Requirements');
  const acceptanceCriteria = sectionBody(description, 'Acceptance Criteria');
  const figmaLink = sectionBody(description, 'Figma');
  const edgeCases = sectionBody(description, 'Edge Cases');
  const technicalGuidelines = sectionBody(description, 'Technical Guidelines');
  const statusSection = sectionBody(description, 'Status');

  return {
    requirements: requirements ?? undefined,
    acceptance_criteria: acceptanceCriteria ?? undefined,
    figma_link: figmaLink ?? undefined,
    edge_cases: edgeCases ?? undefined,
    technical_guidelines: technicalGuidelines ?? undefined,
    status: mapLinearStatusToStoryStatus(statusSection) ?? undefined,
  };
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
  linearIssueSync: LinearIssueSync | null,
  target: LinearStorySyncTarget | null,
): Promise<LinearIssueSnapshot | null> {
  return syncStoryToLinear(story, linearIssueSync, null, target);
}

export async function syncStoryToLinear(
  story: StoryForLinearSync,
  linearIssueSync: LinearIssueSync | null,
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
