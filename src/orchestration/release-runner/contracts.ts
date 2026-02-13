export type ReleaseRunState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface ReleaseRunItem {
  storyId: string;
  linearIssueId: string | null;
  sessionId: string | null;
  status: ReleaseRunState;
  error: string | null;
}

export interface ReleaseRunRequest {
  releaseId: string;
  initiatedBy: string;
}

export interface ReleaseRunResult {
  runId: string;
  status: ReleaseRunState;
  items: ReleaseRunItem[];
}

export interface ReleaseRunnerPort {
  enqueueReleaseRun(input: ReleaseRunRequest): Promise<ReleaseRunResult>;
  getReleaseRun(runId: string): Promise<ReleaseRunResult | null>;
}
