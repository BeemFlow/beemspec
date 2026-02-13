import type { ReleaseRunnerPort, ReleaseRunRequest, ReleaseRunResult } from '@/orchestration/release-runner/contracts';

const runs = new Map<string, ReleaseRunResult>();

export function createReleaseRunnerStub(enabled: boolean): ReleaseRunnerPort | null {
  if (!enabled) return null;

  return {
    async enqueueReleaseRun(_input: ReleaseRunRequest): Promise<ReleaseRunResult> {
      const runId = crypto.randomUUID();
      const run: ReleaseRunResult = {
        runId,
        status: 'queued',
        items: [],
      };
      runs.set(runId, run);
      return run;
    },
    async getReleaseRun(runId: string): Promise<ReleaseRunResult | null> {
      return runs.get(runId) ?? null;
    },
  };
}
