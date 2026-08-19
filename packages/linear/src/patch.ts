import type { StoryContent } from '@beemspec/storymap';
import type { StoryPatchFromRemote } from '@beemspec/sync';
import { parseLinearDescriptionToStoryFields } from './description';
import { mapLinearStatusToStoryStatus } from './status-map';

/** Input shape for building a story patch from a Linear issue. */
export interface LinearIssueForSync {
  title: string | null;
  description: string | null;
  stateName: string | null;
  updatedAt: string;
}

/**
 * Build a generic StoryPatchFromRemote by parsing a Linear issue's
 * description (markdown sections) and mapping its state name.
 */
export function buildStoryPatchFromLinearIssue(input: LinearIssueForSync): StoryPatchFromRemote {
  const fromDescription = parseLinearDescriptionToStoryFields(input.description);
  const patch: StoryPatchFromRemote = {
    updated_at: input.updatedAt,
  };

  if (input.title) patch.title = input.title;

  // Build content patch from parsed description fields
  const contentPatch: Partial<StoryContent> = {};
  let hasContentFields = false;
  if (typeof fromDescription.user_story === 'string') {
    contentPatch.user_story = fromDescription.user_story;
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
  patch.status = mappedFromState ?? undefined;

  return patch;
}
