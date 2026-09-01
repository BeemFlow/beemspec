import { describe, expect, it } from 'vitest';
import {
  createAnnotations,
  describeDbError,
  destructiveAnnotations,
  errorResult,
  successResult,
  updateAnnotations,
} from './tool-support';

describe('MCP tool support', () => {
  it('returns compact structured and text success content', () => {
    const result = successResult({ id: 'item-1' });

    expect(result.structuredContent).toEqual({ ok: true, data: { id: 'item-1' } });
    expect(result.content).toEqual([{ type: 'text', text: '{"ok":true,"data":{"id":"item-1"}}' }]);
  });

  it('returns model-visible tool errors', () => {
    const result = errorResult('Unable to update item', { code: 'P0001' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      ok: false,
      error: 'Unable to update item',
      details: { code: 'P0001' },
    });
  });

  it('does not expose raw database diagnostics', () => {
    expect(
      describeDbError({
        code: '23505',
        message: 'duplicate key violates internal_constraint_name',
        details: 'Key (secret_column) already exists',
        hint: 'Inspect private_table',
      }),
    ).toEqual({ code: '23505' });
    expect(describeDbError(new Error('connection string leaked'))).toEqual({});
  });

  it('accurately distinguishes create, update, and destructive idempotence', () => {
    expect(createAnnotations).toMatchObject({ idempotentHint: false, destructiveHint: false });
    expect(updateAnnotations).toMatchObject({ idempotentHint: true, destructiveHint: false });
    expect(destructiveAnnotations).toMatchObject({ idempotentHint: true, destructiveHint: true });
  });
});
