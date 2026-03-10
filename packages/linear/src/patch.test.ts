import { describe, expect, it } from 'vitest';
import { buildStoryPatchFromLinearIssue } from './patch';

describe('buildStoryPatchFromLinearIssue', () => {
  it('builds patch from linear issue snapshot fields', () => {
    const patch = buildStoryPatchFromLinearIssue({
      title: 'Remote title',
      description: '## Requirements\nReq\n\n## Acceptance Criteria\n- [ ] AC',
      stateName: 'In Progress',
      updatedAt: '2026-02-14T11:00:00.000Z',
    });

    expect(patch).toMatchObject({
      title: 'Remote title',
      content: {
        requirements: 'Req',
        acceptance_criteria: '- [ ] AC',
      },
      status: 'in_progress',
      updated_at: '2026-02-14T11:00:00.000Z',
    });
  });
});
