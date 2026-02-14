import {
  mapLinearStatusToStoryStatus,
  parseLinearDescriptionToStoryFields,
  type StoryStatus,
} from '@/integrations/linear/story-sync';

export interface LinearIssueForReconcile {
  title: string | null;
  description: string | null;
  stateName: string | null;
  updatedAt: string;
}

export interface StoryPatchFromLinear {
  title?: string;
  requirements?: string;
  acceptance_criteria?: string;
  figma_link?: string | null;
  edge_cases?: string | null;
  technical_guidelines?: string | null;
  status?: StoryStatus;
  updated_at: string;
}

export function parseTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function shouldApplyRemoteUpdate(remoteUpdatedAt: string | null, localUpdatedAt: string | null): boolean {
  const remoteMs = parseTimestampMs(remoteUpdatedAt);
  const localMs = parseTimestampMs(localUpdatedAt);
  if (remoteMs === null || localMs === null) return false;
  return remoteMs > localMs;
}

export function buildStoryPatchFromLinearIssue(input: LinearIssueForReconcile): StoryPatchFromLinear {
  const fromDescription = parseLinearDescriptionToStoryFields(input.description);
  const patch: StoryPatchFromLinear = {
    updated_at: input.updatedAt,
  };

  if (input.title) patch.title = input.title;
  if (typeof fromDescription.requirements === 'string') patch.requirements = fromDescription.requirements;
  if (typeof fromDescription.acceptance_criteria === 'string')
    patch.acceptance_criteria = fromDescription.acceptance_criteria;
  if ('figma_link' in fromDescription) patch.figma_link = fromDescription.figma_link ?? null;
  if ('edge_cases' in fromDescription) patch.edge_cases = fromDescription.edge_cases ?? null;
  if ('technical_guidelines' in fromDescription)
    patch.technical_guidelines = fromDescription.technical_guidelines ?? null;

  const mappedFromState = mapLinearStatusToStoryStatus(input.stateName);
  const mappedFromDescription = mapLinearStatusToStoryStatus(fromDescription.status ?? null);
  patch.status = mappedFromState ?? mappedFromDescription ?? undefined;

  return patch;
}

export function hasMutableStoryFields(patch: StoryPatchFromLinear): boolean {
  return Boolean(
    patch.title ||
      patch.requirements ||
      patch.acceptance_criteria ||
      patch.figma_link !== undefined ||
      patch.edge_cases !== undefined ||
      patch.technical_guidelines !== undefined ||
      patch.status,
  );
}
