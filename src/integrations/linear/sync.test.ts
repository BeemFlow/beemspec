import { describe, expect, it } from 'vitest';
import {
  buildStoryPatchFromLinearIssue,
  hasMutableStoryFields,
  parseTimestampMs,
  shouldApplyRemoteUpdate,
} from './sync';

describe('linear sync helpers', () => {
  it('decides remote should apply when newer', () => {
    expect(shouldApplyRemoteUpdate('2026-02-14T11:00:00.000Z', '2026-02-14T10:00:00.000Z')).toBe(true);
    expect(shouldApplyRemoteUpdate('2026-02-14T10:00:00.000Z', '2026-02-14T11:00:00.000Z')).toBe(false);
    expect(shouldApplyRemoteUpdate('2026-02-14T11:00:00.000Z', '2026-02-14T11:00:00.000Z')).toBe(false);
  });

  it('builds patch from linear issue snapshot fields', () => {
    const patch = buildStoryPatchFromLinearIssue({
      title: 'Remote title',
      description: '## Requirements\nReq\n\n## Acceptance Criteria\n- [ ] AC\n\n## Status\nIn Progress',
      stateName: null,
      updatedAt: '2026-02-14T11:00:00.000Z',
    });

    expect(patch).toMatchObject({
      title: 'Remote title',
      requirements: 'Req',
      acceptance_criteria: '- [ ] AC',
      status: 'in_progress',
      updated_at: '2026-02-14T11:00:00.000Z',
    });
    expect(hasMutableStoryFields(patch)).toBe(true);
  });

  it('parses timestamp safely', () => {
    expect(parseTimestampMs('2026-02-14T11:00:00.000Z')).not.toBeNull();
    expect(parseTimestampMs('not-a-date')).toBeNull();
  });
});
