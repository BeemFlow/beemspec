import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteLinearOAuthConnectionForTeam,
  getLinearOAuthConnectionForTeam,
  getLinearOAuthConnectionStatusForTeam,
  hasLinearOAuthConnectionForTeam,
  isExpired,
  toExpiresAt,
  upsertLinearOAuthConnection,
} from './connections';

describe('linear connections', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'));
  });

  it('treats near-expiry tokens as expired and computes future expiry timestamps', () => {
    expect(isExpired('2026-03-26T12:00:30Z')).toBe(true);
    expect(isExpired('2026-03-26T13:00:00Z')).toBe(false);
    expect(isExpired('not-a-date')).toBe(false);
    expect(toExpiresAt(3600)).toBe('2026-03-26T13:00:00.000Z');
    expect(toExpiresAt(0)).toBeNull();
  });

  it('loads and normalizes stored oauth connection rows', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        team_id: 'team-1',
        access_token: 'access-1',
        refresh_token: ' refresh-1 ',
        token_type: ' Bearer ',
        scope: ' read write ',
        expires_at: ' 2026-03-26T13:00:00Z ',
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn(() => ({ select })) } as never;

    await expect(getLinearOAuthConnectionForTeam(supabase, 'team-1')).resolves.toEqual({
      teamId: 'team-1',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      tokenType: 'Bearer',
      scope: 'read write',
      expiresAt: '2026-03-26T13:00:00Z',
    });
  });

  it('reports connection presence, status shape, and persists/deletes rows', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { team_id: 'team-1' }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockReturnValue({ eq: deleteEq });
    const supabase = { from: vi.fn(() => ({ select, upsert, delete: remove })) } as never;

    await expect(hasLinearOAuthConnectionForTeam(supabase, 'team-1')).resolves.toBe(true);

    maybeSingle.mockResolvedValueOnce({
      data: { team_id: 'team-1', scope: ' read ', expires_at: ' 2026-03-26T13:00:00Z ' },
      error: null,
    });
    await expect(getLinearOAuthConnectionStatusForTeam(supabase, 'team-1')).resolves.toEqual({
      teamId: 'team-1',
      scope: 'read',
      expiresAt: '2026-03-26T13:00:00Z',
    });

    await upsertLinearOAuthConnection(supabase, {
      teamId: 'team-1',
      accessToken: 'access-1',
      refreshToken: null,
      tokenType: 'Bearer',
      scope: 'read',
      expiresAt: null,
      userId: 'user-1',
    });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ team_id: 'team-1', created_by: 'user-1' }), {
      onConflict: 'team_id',
    });

    await deleteLinearOAuthConnectionForTeam(supabase, 'team-1');
    expect(deleteEq).toHaveBeenCalledWith('team_id', 'team-1');
  });
});
