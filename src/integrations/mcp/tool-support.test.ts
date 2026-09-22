import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAnnotations,
  describeDbError,
  destructiveAnnotations,
  errorResult,
  successResult,
  updateAnnotations,
  withToolErrorBoundary,
} from './tool-support';

describe('MCP tool support', () => {
  afterEach(() => vi.restoreAllMocks());

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
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      describeDbError({
        code: '23505',
        message: 'duplicate key violates internal_constraint_name',
        details: 'Key (secret_column) already exists',
        hint: 'Inspect private_table',
      }),
    ).toEqual({ code: '23505' });
    expect(describeDbError(new Error('connection string leaked'))).toEqual({});
    expect(describeDbError({ code: 'P0001', message: 'Unexpected private_table exception' })).toEqual({
      code: 'P0001',
    });
    expect(log).toHaveBeenCalledTimes(3);
  });

  it.each([
    'Order array must contain all sibling ids',
    'Order array includes ids outside target siblings',
    'Target order must include moved story id',
    'Story target task must belong to the same story map',
  ])('preserves the safe recovery message: %s', (message) => {
    expect(describeDbError({ code: 'P0001', message, details: 'private row data', hint: 'private function' })).toEqual({
      code: 'P0001',
      message,
    });
  });

  it('preserves known service validation failures without exposing arbitrary Error messages', () => {
    const message = 'Source and target nodes must belong to the same process flow';
    expect(describeDbError(new Error(message))).toEqual({ message });
  });

  it('logs unexpected exceptions once without exposing their contents', async () => {
    const error = new Error('private connection details');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const tool = withToolErrorBoundary('test_tool', async () => {
      throw error;
    });

    const result = await tool({});
    expect(result).toEqual(errorResult('Unexpected server error'));
    expect(log).toHaveBeenCalledExactlyOnceWith('[mcp] test_tool failed', error);
  });

  it('distinguishes additive creates from idempotent overwrites and deletes', () => {
    expect(createAnnotations).toMatchObject({ idempotentHint: false, destructiveHint: false });
    expect(updateAnnotations).toMatchObject({ idempotentHint: true, destructiveHint: true });
    expect(destructiveAnnotations).toMatchObject({ idempotentHint: true, destructiveHint: true });
  });
});
