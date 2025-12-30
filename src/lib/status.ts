import type { StoryStatus } from '@/types'

export const STATUS_LABELS: Record<StoryStatus, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
}

export const STATUS_VARIANTS: Record<StoryStatus, 'default' | 'secondary' | 'outline'> = {
  backlog: 'outline',
  ready: 'secondary',
  in_progress: 'default',
  review: 'secondary',
  done: 'default',
}

// For use in Select components
export const STATUS_OPTIONS: { value: StoryStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'ready', label: 'Ready' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Done' },
]
