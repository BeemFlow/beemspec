import type { StoryStatus } from '@/integrations/sync';

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

  if (['backlog', 'todo'].includes(normalized)) return 'backlog';
  if (['ready', 'planned'].includes(normalized)) return 'ready';
  if (['in_progress', 'started', 'inprogress'].includes(normalized)) return 'in_progress';
  if (['review', 'in_review'].includes(normalized)) return 'review';
  if (['done', 'complete', 'completed', 'canceled', 'cancelled'].includes(normalized)) return 'done';
  return null;
}
