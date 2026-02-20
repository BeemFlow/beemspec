import type { StoryContent } from '@beemspec/storymap';
import {
  mapLinearStatusToStoryStatus,
  parseLinearDescriptionToStoryFields,
  type StoryStatus,
} from '@/integrations/linear/story-sync';

export interface LinearIssueForSync {
  title: string | null;
  description: string | null;
  stateName: string | null;
  updatedAt: string;
}

export const LINEAR_SYNC_DIRECTION = {
  remoteToLocal: 'remote_to_local',
  localToRemote: 'local_to_remote',
} as const;

export type LinearSyncDirection = (typeof LINEAR_SYNC_DIRECTION)[keyof typeof LINEAR_SYNC_DIRECTION];

export interface StoryPatchFromLinear {
  title?: string;
  content?: Partial<StoryContent>;
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

export function buildStoryPatchFromLinearIssue(input: LinearIssueForSync): StoryPatchFromLinear {
  const fromDescription = parseLinearDescriptionToStoryFields(input.description);
  const patch: StoryPatchFromLinear = {
    updated_at: input.updatedAt,
  };

  if (input.title) patch.title = input.title;

  // Build content patch from parsed description fields
  const contentPatch: Partial<StoryContent> = {};
  let hasContentFields = false;
  if (typeof fromDescription.requirements === 'string') {
    contentPatch.requirements = fromDescription.requirements;
    hasContentFields = true;
  }
  if (typeof fromDescription.acceptance_criteria === 'string') {
    contentPatch.acceptance_criteria = fromDescription.acceptance_criteria;
    hasContentFields = true;
  }
  if ('figma_link' in fromDescription) {
    contentPatch.figma_link = fromDescription.figma_link ?? null;
    hasContentFields = true;
  }
  if ('edge_cases' in fromDescription) {
    contentPatch.edge_cases = fromDescription.edge_cases ?? null;
    hasContentFields = true;
  }
  if ('technical_guidelines' in fromDescription) {
    contentPatch.technical_guidelines = fromDescription.technical_guidelines ?? null;
    hasContentFields = true;
  }
  if (hasContentFields) {
    patch.content = contentPatch;
  }

  const mappedFromState = mapLinearStatusToStoryStatus(input.stateName);
  const mappedFromDescription = mapLinearStatusToStoryStatus(fromDescription.status ?? null);
  patch.status = mappedFromState ?? mappedFromDescription ?? undefined;

  return patch;
}

export function hasMutableStoryFields(patch: StoryPatchFromLinear): boolean {
  return Boolean(patch.title || patch.content || patch.status);
}
