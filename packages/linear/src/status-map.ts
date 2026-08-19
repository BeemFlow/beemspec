import type { StoryStatus } from '@beemspec/sync';

function normalizeStatusCandidate(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, '_');
}

/**
 * Map a Linear workflow state name (e.g. "In Progress", "Completed")
 * to a BeemSpec StoryStatus. Returns null for unrecognized values.
 */
export function mapLinearStatusToStoryStatus(value: string | null): StoryStatus | null {
  if (!value) return null;
  const normalized = normalizeStatusCandidate(value);

  if (['backlog'].includes(normalized)) return 'backlog';
  if (['todo', 'ready', 'planned'].includes(normalized)) return 'todo';
  if (['in_progress', 'started', 'inprogress'].includes(normalized)) return 'in_progress';
  if (['review', 'in_review'].includes(normalized)) return 'in_review';
  if (['done', 'complete', 'completed', 'canceled', 'cancelled'].includes(normalized)) return 'done';
  return null;
}

export function mapLinearStateToStoryStatus(input: {
  stateId?: string | null;
  stateName?: string | null;
  statusMapping?: Partial<Record<StoryStatus, string>> | null;
}): StoryStatus | null {
  const normalizedStateId = input.stateId?.trim();
  if (normalizedStateId && input.statusMapping) {
    const entries = Object.entries(input.statusMapping) as Array<[StoryStatus, string | undefined]>;
    const matched = entries.find(([, linearStateId]) => linearStateId === normalizedStateId);
    if (matched) return matched[0];
  }

  return mapLinearStatusToStoryStatus(input.stateName ?? null);
}
