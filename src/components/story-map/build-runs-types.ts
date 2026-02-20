export interface OpenCodeProject {
  id: string;
  path: string;
}

export type BuildRunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface BuildRunSummary {
  id: string;
  release_id: string;
  status: BuildRunStatus;
  total_items: number;
  completed_items: number;
  failed_items: number;
  error: string | null;
  opencode_session_url: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface BuildRunItem {
  id: string;
  story_id: string;
  linear_issue_id: string | null;
  linear_issue_identifier: string | null;
  status: 'pending' | 'synced' | 'failed';
  error: string | null;
  retry_count: number;
  last_retry_at: string | null;
  story?: { title: string; status: string } | null;
  created_at: string;
  updated_at: string;
}

export interface BuildRunDetail extends BuildRunSummary {
  items: BuildRunItem[];
}

export interface BuildRunsResponse {
  limit: number;
  offset: number;
  next_offset: number | null;
  runs: BuildRunSummary[];
}

export interface BuildReleaseResponse {
  run_id: string;
}

export interface RetryRunResponse {
  run_id: string;
}
