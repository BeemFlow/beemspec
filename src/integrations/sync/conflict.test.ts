import { describe, expect, it } from 'vitest';
import { parseTimestampMs, shouldApplyRemoteUpdate } from './conflict';

describe('generic sync conflict resolution', () => {
  it('decides remote should apply when newer', () => {
    expect(shouldApplyRemoteUpdate('2026-02-14T11:00:00.000Z', '2026-02-14T10:00:00.000Z')).toBe(true);
    expect(shouldApplyRemoteUpdate('2026-02-14T10:00:00.000Z', '2026-02-14T11:00:00.000Z')).toBe(false);
    expect(shouldApplyRemoteUpdate('2026-02-14T11:00:00.000Z', '2026-02-14T11:00:00.000Z')).toBe(false);
  });

  it('parses timestamp safely', () => {
    expect(parseTimestampMs('2026-02-14T11:00:00.000Z')).not.toBeNull();
    expect(parseTimestampMs('not-a-date')).toBeNull();
  });
});
