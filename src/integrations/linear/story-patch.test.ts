import { describe, expect, it } from 'vitest';
import { buildDbUpdateFromPatch, hasMutableStoryFields } from './story-patch';

describe('hasMutableStoryFields', () => {
  it('returns true when patch has title, content, or status', () => {
    expect(hasMutableStoryFields({ title: 'x', updated_at: '' })).toBe(true);
    expect(hasMutableStoryFields({ content: { user_story: 'r' }, updated_at: '' })).toBe(true);
    expect(hasMutableStoryFields({ status: 'done', updated_at: '' })).toBe(true);
  });

  it('returns false when patch has only updated_at', () => {
    expect(hasMutableStoryFields({ updated_at: '' })).toBe(false);
  });
});

describe('buildDbUpdateFromPatch', () => {
  it('sets scalar fields directly', () => {
    const result = buildDbUpdateFromPatch({ title: 'New', status: 'done', updated_at: '2026-01-01T00:00:00Z' }, null);
    expect(result).toEqual({
      title: 'New',
      status: 'done',
      updated_at: '2026-01-01T00:00:00Z',
    });
  });

  it('merges content patch into existing content', () => {
    const existing = { _version: 1 as const, user_story: 'old', acceptance_criteria: 'old ac' };
    const result = buildDbUpdateFromPatch(
      { content: { user_story: 'new' }, updated_at: '2026-01-01T00:00:00Z' },
      existing,
    );
    expect(result).toEqual({
      updated_at: '2026-01-01T00:00:00Z',
      content: { _version: 1, user_story: 'new', acceptance_criteria: 'old ac' },
    });
  });

  it('uses default empty content when no current content exists', () => {
    const result = buildDbUpdateFromPatch({ content: { user_story: 'new' }, updated_at: '2026-01-01T00:00:00Z' }, null);
    expect(result).toEqual({
      updated_at: '2026-01-01T00:00:00Z',
      content: { _version: 1, user_story: 'new', acceptance_criteria: '' },
    });
  });
});
