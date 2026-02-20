import type { StoryContent } from '@beemspec/storymap';
import type { IssueUpsertInput, StoryForSync, SyncTarget } from '@/integrations/sync';
import { mapLinearStatusToStoryStatus } from './status-map';

// ---------------------------------------------------------------------------
// Markdown section helpers
// ---------------------------------------------------------------------------

function section(title: string, body: string | null | undefined): string | null {
  if (!body) return null;
  return `## ${title}\n${body}`;
}

function sectionBody(description: string, title: string): string | null {
  const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`## ${escapedTitle}\\n([\\s\\S]*?)(?=\\n\\n## |$)`);
  const match = description.match(pattern);
  if (!match) return null;
  const body = match[1].trim();
  return body.length > 0 ? body : null;
}

// ---------------------------------------------------------------------------
// Serialize story -> Linear markdown description
// ---------------------------------------------------------------------------

/** Build a Linear-formatted markdown description from a BeemSpec story. */
export function buildLinearDescription(story: StoryForSync): string {
  const { content } = story;
  const parts = [
    section('Requirements', content.requirements),
    section('Acceptance Criteria', content.acceptance_criteria),
    section('Status', story.status),
    section('Figma', content.figma_link),
    section('Edge Cases', content.edge_cases),
    section('Technical Guidelines', content.technical_guidelines),
    section('BeemSpec Story ID', story.id),
  ].filter((value): value is string => Boolean(value));

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Parse Linear markdown description -> story fields
// ---------------------------------------------------------------------------

export interface ParsedLinearStoryFields {
  requirements?: string;
  acceptance_criteria?: string;
  figma_link?: string | null;
  edge_cases?: string | null;
  technical_guidelines?: string | null;
  status?: string;
}

/** Parse a Linear issue description (markdown) back into story content fields. */
export function parseLinearDescriptionToStoryFields(description: string | null): ParsedLinearStoryFields {
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

// ---------------------------------------------------------------------------
// Map story -> Linear issue input
// ---------------------------------------------------------------------------

/**
 * Convert a BeemSpec story + sync target into a Linear IssueUpsertInput.
 * The description is serialized in Linear's markdown section format.
 */
export function mapStoryToLinearIssueInput(story: StoryForSync, target: SyncTarget): IssueUpsertInput {
  return {
    title: story.title,
    description: buildLinearDescription(story),
    teamId: target.teamId,
    projectId: target.projectId,
    stateId: target.stateId,
  };
}
