import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { DELETE as deleteInvite } from './teams/[id]/invites/[inviteId]/route';
import { GET as getInvites, POST as postInvite } from './teams/[id]/invites/route';
import { DELETE as deleteMember } from './teams/[id]/members/[userId]/route';
import { GET as getMembers } from './teams/[id]/members/route';

vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({ get: () => 'localhost:3000' }),
}));

const VALID_ID = 'd7f34189-5d27-4dc0-b2c5-23d11796add4';

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createInvitesPostClient(options?: {
  members?: Array<{ email: string }>;
  existingInvite?: { id: string } | null;
  inviteInsertError?: { message: string } | null;
  memberInsertError?: { message: string } | null;
}) {
  const rpc = vi.fn().mockResolvedValue({ data: options?.members ?? [], error: null });

  const existingInviteSingle = vi.fn().mockResolvedValue({ data: options?.existingInvite ?? null, error: null });
  const existingInviteIs = vi.fn().mockReturnValue({ single: existingInviteSingle });
  const existingInviteEqEmail = vi.fn().mockReturnValue({ is: existingInviteIs });
  const existingInviteEqTeam = vi.fn().mockReturnValue({ eq: existingInviteEqEmail });
  const existingInviteSelect = vi.fn().mockReturnValue({ eq: existingInviteEqTeam });

  const insertSingle = vi
    .fn()
    .mockResolvedValue({ data: { id: 'invite-1' }, error: options?.inviteInsertError ?? null });
  const insertSelect = vi.fn().mockReturnValue({ single: insertSingle });
  const insert = vi.fn().mockReturnValue({ select: insertSelect });

  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockReturnValue({ eq: deleteEq });

  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });

  const memberInsert = vi.fn().mockResolvedValue({ error: options?.memberInsertError ?? null });

  const from = vi.fn((table: string) => {
    if (table === 'team_invites') {
      return {
        select: existingInviteSelect,
        insert,
        delete: remove,
        update,
      };
    }

    if (table === 'team_members') {
      return {
        insert: memberInsert,
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: { rpc, from },
    stubs: {
      memberInsert,
      update,
      remove,
    },
  };
}

describe('team API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      success: true,
      user: { id: 'user-1', email: 'user@test.com' },
    } as never);
  });

  it('returns 400 for invalid team id on members route', async () => {
    const response = await getMembers(new Request('http://localhost/api/test'), {
      params: Promise.resolve({ id: 'invalid-id' }),
    });

    expect(response.status).toBe(400);
  });

  it('loads team members through rpc', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'm1' }], error: null });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);

    const response = await getMembers(new Request('http://localhost/api/test'), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(rpc).toHaveBeenCalledWith('get_team_members', { p_team_id: VALID_ID });
    await expect(response.json()).resolves.toEqual([{ id: 'm1' }]);
  });

  it('returns 400 when remove_team_member rpc returns domain error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { error: 'Cannot remove owner' }, error: null });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);

    const response = await deleteMember(new Request('http://localhost/api/test'), {
      params: Promise.resolve({ id: VALID_ID, userId: VALID_ID }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Cannot remove owner' });
  });

  it('returns pending invites for team owners', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: 'invite-1' }], error: null });
    const is = vi.fn().mockReturnValue({ order });
    const eq = vi.fn().mockReturnValue({ is });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await getInvites(new Request('http://localhost/api/test'), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    await expect(response.json()).resolves.toEqual([{ id: 'invite-1' }]);
  });

  it('returns 404 when cancel invite cannot find row', async () => {
    const secondEq = vi.fn().mockResolvedValue({ error: { code: 'PGRST116' } });
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
    const remove = vi.fn().mockReturnValue({ eq: firstEq });
    const from = vi.fn().mockReturnValue({ delete: remove });
    vi.mocked(createClient).mockResolvedValue({ from } as never);

    const response = await deleteInvite(new Request('http://localhost/api/test'), {
      params: Promise.resolve({ id: VALID_ID, inviteId: VALID_ID }),
    });

    expect(response.status).toBe(404);
  });

  it('returns 400 for invalid UUID combinations on nested routes', async () => {
    const invalidMemberCases = [
      { id: 'invalid', userId: VALID_ID },
      { id: VALID_ID, userId: 'invalid' },
    ];
    const invalidInviteCases = [
      { id: 'invalid', inviteId: VALID_ID },
      { id: VALID_ID, inviteId: 'invalid' },
    ];

    for (const testCase of invalidMemberCases) {
      const memberResponse = await deleteMember(new Request('http://localhost/api/test'), {
        params: Promise.resolve(testCase),
      });
      expect(memberResponse.status).toBe(400);
    }

    for (const testCase of invalidInviteCases) {
      const inviteResponse = await deleteInvite(new Request('http://localhost/api/test'), {
        params: Promise.resolve(testCase),
      });
      expect(inviteResponse.status).toBe(400);
    }
  });

  it('returns 400 when invite target is already a member', async () => {
    const { client } = createInvitesPostClient({ members: [{ email: 'person@example.com' }] });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const response = await postInvite(jsonRequest({ email: 'person@example.com' }), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'User is already a team member' });
  });

  it('creates pending invite when user is not yet in auth users', async () => {
    const { client } = createInvitesPostClient({ members: [] });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(createAdminClient).mockReturnValue({
      auth: {
        admin: {
          inviteUserByEmail: vi.fn().mockResolvedValue({
            data: { user: { id: 'u-2', identities: [{}] } },
            error: null,
          }),
        },
      },
    } as never);

    const response = await postInvite(jsonRequest({ email: 'person@example.com' }), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ status: 'invited', message: 'Invitation sent' });
  });

  it('rolls back invite row when auth invite call fails', async () => {
    const { client, stubs } = createInvitesPostClient({ members: [] });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(createAdminClient).mockReturnValue({
      auth: {
        admin: {
          inviteUserByEmail: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'smtp failed' } }),
        },
      },
    } as never);

    const response = await postInvite(jsonRequest({ email: 'person@example.com' }), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(stubs.remove).toHaveBeenCalled();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to send invite' });
  });

  it('adds existing auth user directly to team when identities are empty', async () => {
    const { client, stubs } = createInvitesPostClient({ members: [] });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(createAdminClient).mockReturnValue({
      auth: {
        admin: {
          inviteUserByEmail: vi.fn().mockResolvedValue({
            data: { user: { id: 'u-2', identities: [] } },
            error: null,
          }),
        },
      },
    } as never);

    const response = await postInvite(jsonRequest({ email: 'person@example.com' }), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(stubs.memberInsert).toHaveBeenCalled();
    expect(stubs.update).toHaveBeenCalled();
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ status: 'added', message: 'User added to team' });
  });

  it('returns 500 when direct-add member insert fails', async () => {
    const { client } = createInvitesPostClient({
      members: [],
      memberInsertError: { message: 'insert failed' },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(createAdminClient).mockReturnValue({
      auth: {
        admin: {
          inviteUserByEmail: vi.fn().mockResolvedValue({
            data: { user: { id: 'u-2', identities: [] } },
            error: null,
          }),
        },
      },
    } as never);

    const response = await postInvite(jsonRequest({ email: 'person@example.com' }), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to add member' });
  });
});
