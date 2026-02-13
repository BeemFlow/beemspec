import { describe, expect, it } from 'vitest';
import { createReleaseRunnerStub } from './stub';

describe('release runner stub contracts', () => {
  it('returns null when integration flag is disabled', () => {
    expect(createReleaseRunnerStub(false)).toBeNull();
  });

  it('stores and retrieves queued run state', async () => {
    const runner = createReleaseRunnerStub(true);
    expect(runner).not.toBeNull();
    if (!runner) throw new Error('Expected release runner stub to be created');

    const run = await runner.enqueueReleaseRun({
      releaseId: 'release-1',
      initiatedBy: 'user-1',
    });
    const fetched = await runner.getReleaseRun(run.runId);

    expect(run.status).toBe('queued');
    expect(fetched).toEqual(run);
  });
});
