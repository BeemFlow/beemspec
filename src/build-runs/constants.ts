export const BUILD_RUN_STATUS = {
  queued: 'queued',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
} as const;

export type BuildRunStatus = (typeof BUILD_RUN_STATUS)[keyof typeof BUILD_RUN_STATUS];

export const BUILD_RUN_ITEM_STATUS = {
  pending: 'pending',
  synced: 'synced',
  failed: 'failed',
} as const;

export type BuildRunItemStatus = (typeof BUILD_RUN_ITEM_STATUS)[keyof typeof BUILD_RUN_ITEM_STATUS];

export const BUILD_RUN_TABLE = 'build_runs';
export const BUILD_RUN_ITEMS_TABLE = 'build_run_items';
