import { describe, expect, it, vi } from 'vitest';
import { getTeamRoleForUser, isTeamOwnerForRequest, listTeamsForUser } from './teams';

describe('teams helpers', () => {
  it('returns memberships enriched with team names', async () => {
    const membershipsEq = vi.fn().mockResolvedValue({
      data: [
        { team_id: 'team-1', role: 'owner' },
        { team_id: 'team-2', role: 'member' },
      ],
      error: null,
    });
    const membershipsSelect = vi.fn().mockReturnValue({ eq: membershipsEq });

    const teamsIn = vi.fn().mockResolvedValue({
      data: [{ id: 'team-1', name: 'Alpha' }],
      error: null,
    });
    const teamsSelect = vi.fn().mockReturnValue({ in: teamsIn });

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'team_members') return { select: membershipsSelect };
        if (table === 'teams') return { select: teamsSelect };
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as never;

    const result = await listTeamsForUser(supabase, 'user-1');

    expect(result).toEqual({
      data: [
        { team_id: 'team-1', role: 'owner', name: 'Alpha' },
        { team_id: 'team-2', role: 'member', name: null },
      ],
      error: null,
    });
  });

  it('returns null when the user has no team role or the lookup errors', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
    const eqUser = vi.fn().mockReturnValue({ maybeSingle });
    const eqTeam = vi.fn().mockReturnValue({ eq: eqUser });
    const select = vi.fn().mockReturnValue({ eq: eqTeam });

    const supabase = { from: vi.fn(() => ({ select })) } as never;

    await expect(getTeamRoleForUser(supabase, 'user-1', 'team-1')).resolves.toBeNull();
    expect(eqTeam).toHaveBeenCalledWith('team_id', 'team-1');
    expect(eqUser).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('returns true only for owners in request-scoped checks', async () => {
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({ data: { role: 'owner' }, error: null })
      .mockResolvedValueOnce({ data: { role: 'member' }, error: null });
    const eqUser = vi.fn().mockReturnValue({ maybeSingle });
    const eqTeam = vi.fn().mockReturnValue({ eq: eqUser });
    const select = vi.fn().mockReturnValue({ eq: eqTeam });

    const supabase = { from: vi.fn(() => ({ select })) } as never;

    await expect(isTeamOwnerForRequest(supabase, 'user-1', 'team-1')).resolves.toBe(true);
    await expect(isTeamOwnerForRequest(supabase, 'user-2', 'team-1')).resolves.toBe(false);
  });
});
