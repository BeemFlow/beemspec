import { describe, expect, it, vi } from 'vitest';
import { getStoryLinearLink, getStoryLinearLinkByLinearIssueId, upsertStoryLinearLink } from './story-links';

describe('story linear links', () => {
  it('returns null when no link exists', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const link = await getStoryLinearLink({ from }, 'story_1');

    expect(link).toBeNull();
  });

  it('upserts link as synced', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        story_id: 'story_1',
        linear_issue_id: 'lin_1',
        linear_issue_identifier: 'ENG-101',
      },
      error: null,
    });
    const select = vi.fn().mockReturnValue({ single });
    const upsert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ upsert });

    const link = await upsertStoryLinearLink(
      { from },
      {
        storyId: 'story_1',
        linearIssueId: 'lin_1',
        linearIssueIdentifier: 'ENG-101',
      },
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        story_id: 'story_1',
        linear_issue_id: 'lin_1',
        sync_state: 'synced',
        sync_error: null,
      }),
      { onConflict: 'story_id' },
    );

    expect(link).toEqual({
      storyId: 'story_1',
      linearIssueId: 'lin_1',
      linearIssueIdentifier: 'ENG-101',
      lastLocalUpdatedAt: null,
      lastLinearUpdatedAt: null,
    });
  });

  it('looks up link by linear issue id', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        story_id: 'story_2',
        linear_issue_id: 'lin_2',
        linear_issue_identifier: 'ENG-102',
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });

    const link = await getStoryLinearLinkByLinearIssueId({ from }, 'lin_2');

    expect(link).toEqual({
      storyId: 'story_2',
      linearIssueId: 'lin_2',
      linearIssueIdentifier: 'ENG-102',
      lastLocalUpdatedAt: null,
      lastLinearUpdatedAt: null,
    });
  });
});
