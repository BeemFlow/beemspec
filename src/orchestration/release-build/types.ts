export type ReleaseRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export type ReleaseRunItemStatus = 'pending' | 'synced' | 'failed';

export type OrchestrationJobKind = 'story_build' | 'story_linear_sync';

export type OrchestrationJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface StoryBuildJobPayload {
  release_id: string;
  release_run_id: string;
  story_map_id: string;
  story_ids: string[];
}

export interface StoryLinearSyncJobPayload {
  story_id: string;
}

export interface OrchestrationJobRow {
  id: string;
  kind: OrchestrationJobKind;
  status: OrchestrationJobStatus;
  attempts: number;
  max_attempts: number;
  payload: StoryBuildJobPayload | StoryLinearSyncJobPayload;
}

export interface OrchestrationJobDispatchResult {
  claimed: boolean;
  completed?: boolean;
  error?: string;
}

export interface OrchestrationJobSummary {
  considered: number;
  claimed: number;
  completed: number;
  failed: number;
}
