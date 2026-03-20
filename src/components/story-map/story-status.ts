import type { StoryStatus } from '@/types';

export const STATUS_LABELS: Record<StoryStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
};

export const STATUS_VARIANTS: Record<StoryStatus, 'default' | 'secondary' | 'outline'> = {
  backlog: 'outline',
  todo: 'secondary',
  in_progress: 'default',
  in_review: 'default',
  done: 'outline',
};

// Extra className overrides for statuses that need colors outside the standard badge variants
export const STATUS_CLASS: Partial<Record<StoryStatus, string>> = {
  done: 'bg-success text-white border-transparent',
};

export const STATUS_OPTIONS: { value: StoryStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
];
