import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createLinearClientMock, pushStoryToLinearByIdMock, resolveLinearAuthTokenForTeamResultMock } = vi.hoisted(
  () => ({
    createLinearClientMock: vi.fn(),
    pushStoryToLinearByIdMock: vi.fn(),
    resolveLinearAuthTokenForTeamResultMock: vi.fn(),
  }),
);

vi.mock('@/integrations/linear/adapter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/integrations/linear/adapter')>()),
  createLinearClient: createLinearClientMock,
}));
vi.mock('@/integrations/linear/auth', () => ({
  resolveLinearAuthTokenForTeamResult: resolveLinearAuthTokenForTeamResultMock,
}));
vi.mock('@/integrations/linear/story-sync', () => ({
  pushStoryToLinearById: pushStoryToLinearByIdMock,
}));

import { processLinearSyncBatch } from './jobs';

const VERSION = '2026-08-21T12:00:00.000Z';

function makeSupabase(input: {
  readCount?: number;
  stateVersion?: string;
  operation?: 'upsert' | 'delete';
  remoteId?: string | null;
}) {
  const operation = input.operation ?? 'upsert';
  const payload = {
    provider: 'linear',
    entity_type: 'story',
    entity_id: '10000000-0000-4000-8000-000000000041',
    operation,
    desired_version: VERSION,
    ...(operation === 'delete'
      ? { remote_id: input.remoteId ?? 'linear-1', team_id: '20000000-0000-4000-8000-000000000001' }
      : {}),
  };
  const state: Record<string, unknown> = {
    ...payload,
    team_id: '20000000-0000-4000-8000-000000000001',
    desired_version: input.stateVersion ?? VERSION,
    remote_id: input.remoteId ?? null,
    status: 'pending',
  };
  const archived: number[] = [];
  const retries: Array<{ messageId: number; delay: number }> = [];

  const rpc = vi.fn(async (name: string, args: Record<string, number>) => {
    if (name === 'claim_linear_sync_jobs') {
      return {
        data: [
          {
            message_id: 7,
            read_count: input.readCount ?? 1,
            enqueued_at: VERSION,
            payload,
          },
        ],
        error: null,
      };
    }
    if (name === 'archive_linear_sync_job') {
      archived.push(args.p_message_id);
      return { data: true, error: null };
    }
    if (name === 'retry_linear_sync_job') {
      retries.push({ messageId: args.p_message_id, delay: args.p_delay_seconds });
      return { data: true, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });

  function makeChain(mode: 'select' | 'update', changes?: Record<string, unknown>) {
    const filters = new Map<string, unknown>();
    const chain = {
      eq(column: string, value: unknown) {
        filters.set(column, value);
        return chain;
      },
      select() {
        return chain;
      },
      async maybeSingle() {
        if (mode === 'select') return { data: { ...state }, error: null };

        const isCurrent =
          filters.get('operation') === state.operation &&
          Date.parse(String(filters.get('desired_version'))) === Date.parse(String(state.desired_version));
        if (!isCurrent) return { data: null, error: null };
        Object.assign(state, changes);
        return { data: { entity_id: state.entity_id }, error: null };
      },
    };
    return chain;
  }

  const from = vi.fn(() => ({
    select: () => makeChain('select'),
    update: (changes: Record<string, unknown>) => makeChain('update', changes),
  }));

  return { supabase: { rpc, from } as never, state, archived, retries };
}

describe('Linear sync queue batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pushStoryToLinearByIdMock.mockResolvedValue({ id: 'linear-1' });
  });

  it('processes and archives the current upsert message', async () => {
    const fixture = makeSupabase({});

    const summary = await processLinearSyncBatch({ supabase: fixture.supabase, limit: 1 });

    expect(pushStoryToLinearByIdMock).toHaveBeenCalledWith(expect.anything(), {
      storyId: '10000000-0000-4000-8000-000000000041',
      recoverDeterministicCreate: false,
    });
    expect(fixture.archived).toEqual([7]);
    expect(fixture.state).toMatchObject({ status: 'synced', remote_id: 'linear-1' });
    expect(summary).toMatchObject({ claimed: 1, succeeded: 1, retried: 0, failed: 0, stale: 0 });
  });

  it('archives a superseded message without calling Linear', async () => {
    const fixture = makeSupabase({ stateVersion: '2026-08-21T12:01:00.000Z' });

    const summary = await processLinearSyncBatch({ supabase: fixture.supabase });

    expect(pushStoryToLinearByIdMock).not.toHaveBeenCalled();
    expect(fixture.archived).toEqual([7]);
    expect(summary.stale).toBe(1);
  });

  it('makes transient failures visible and delays the same durable message', async () => {
    const fixture = makeSupabase({ readCount: 2 });
    pushStoryToLinearByIdMock.mockRejectedValue(new Error('Linear unavailable'));

    const summary = await processLinearSyncBatch({ supabase: fixture.supabase });

    expect(fixture.archived).toEqual([]);
    expect(fixture.retries).toEqual([{ messageId: 7, delay: 30 }]);
    expect(fixture.state).toMatchObject({ status: 'pending', attempt_count: 2, last_error: 'Linear unavailable' });
    expect(summary.retried).toBe(1);
  });

  it('records and archives a terminal failure after the retry budget', async () => {
    const fixture = makeSupabase({ readCount: 8 });
    pushStoryToLinearByIdMock.mockRejectedValue(new Error('Permanent failure'));

    const summary = await processLinearSyncBatch({ supabase: fixture.supabase });

    expect(fixture.archived).toEqual([7]);
    expect(fixture.state).toMatchObject({ status: 'error', attempt_count: 8, last_error: 'Permanent failure' });
    expect(summary.failed).toBe(1);
  });

  it('processes a remote delete using the stored team and issue ids', async () => {
    const fixture = makeSupabase({ operation: 'delete', remoteId: 'linear-delete-1' });
    const deleteIssue = vi.fn().mockResolvedValue(undefined);
    resolveLinearAuthTokenForTeamResultMock.mockResolvedValue({ status: 'ready', accessToken: 'token' });
    createLinearClientMock.mockReturnValue({ deleteIssue });

    const summary = await processLinearSyncBatch({ supabase: fixture.supabase });

    expect(deleteIssue).toHaveBeenCalledWith('linear-delete-1');
    expect(fixture.state).toMatchObject({ status: 'synced', remote_id: 'linear-delete-1' });
    expect(summary.succeeded).toBe(1);
  });
});
