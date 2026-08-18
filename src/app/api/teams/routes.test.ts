import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { DELETE as deleteInvite } from './[id]/invites/[inviteId]/route';
import { GET as getInvites, POST as postInvite } from './[id]/invites/route';
import { DELETE as deleteMember } from './[id]/members/[userId]/route';
import { GET as getMembers } from './[id]/members/route';
import { POST as createTeam } from './route';

vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn().mockResolvedValue({ get: () => 'localhost:3000' }) }));

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
  registeredUser?: boolean;
  registeredUserError?: { message: string } | null;
}) {
  const getMembersRpc = vi.fn().mockResolvedValue({ data: options?.members ?? [], error: null });
  const acceptInviteRpc = vi.fn().mockResolvedValue({ data: null, error: options?.memberInsertError ?? null });
  const addRegisteredUserRpc = vi.fn().mockResolvedValue({
    data: options?.registeredUser ?? false,
    error: options?.registeredUserError ?? null,
  });
  const rpc = vi.fn((fn: string, args?: unknown) => {
    if (fn === 'get_team_members') return getMembersRpc(args);
    if (fn === 'accept_team_invite_member') return acceptInviteRpc(args);
    if (fn === 'add_registered_user_to_team') return addRegisteredUserRpc(args);
    throw new Error(`Unexpected rpc: ${fn}`);
  });

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

  const from = vi.fn((table: string) => {
    if (table === 'team_invites') return { select: existingInviteSelect, insert, delete: remove };
    throw new Error(`Unexpected table: ${table}`);
  });

  return { client: { rpc, from }, stubs: { acceptInviteRpc, addRegisteredUserRpc, remove } };
}

function createTeamsPostClient(options?: {
  rpcError?: { message: string } | null;
  team?: { id: string; name: string } | null;
}) {
  const single = vi.fn().mockResolvedValue({
    data: options?.team !== undefined ? options.team : { id: 'team-1', name: 'New Team' },
    error: options?.rpcError ?? null,
  });
  const rpc = vi.fn().mockReturnValue({ single });
  return { client: { rpc }, stubs: { rpc, single } };
}

describe('teams routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAuth).mockResolvedValue({
      success: true,
      user: { id: 'user-1', email: 'user@test.com' },
    } as never);
  });

  it('creates a team and returns created team', async () => {
    const { client, stubs } = createTeamsPostClient({ team: { id: 'team-1', name: 'Product' } });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const response = await createTeam(jsonRequest({ name: 'Product' }));
    expect(stubs.rpc).toHaveBeenCalledWith('create_team_with_owner', { p_name: 'Product' });
    expect(response.status).toBe(201);
  });

  it('returns 500 when team-create rpc fails', async () => {
    const { client } = createTeamsPostClient({ rpcError: { message: 'insert failed' } });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const response = await createTeam(jsonRequest({ name: 'Product' }));
    expect(response.status).toBe(500);
  });

  it('loads members through rpc', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 'm1' }], error: null });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
    const response = await getMembers(new Request('http://localhost/api/test'), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    await expect(response.json()).resolves.toEqual([{ id: 'm1' }]);
  });

  it('returns pending invites for team owners', async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: 'invite-1' }], error: null });
    const from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ order }) }) }),
    });
    vi.mocked(createClient).mockResolvedValue({ from } as never);
    const response = await getInvites(new Request('http://localhost/api/test'), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    await expect(response.json()).resolves.toEqual([{ id: 'invite-1' }]);
  });

  it('invites pending user and handles rollback/failure cases', async () => {
    const { client, stubs } = createInvitesPostClient({ members: [] });
    const inviteUserByEmail = vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'smtp failed' } });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(createAdminClient).mockReturnValue({
      auth: {
        admin: {
          inviteUserByEmail,
        },
      },
    } as never);

    const response = await postInvite(jsonRequest({ email: 'person@example.com' }), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(inviteUserByEmail).toHaveBeenCalledWith('person@example.com', {
      redirectTo: 'http://localhost/invite/accept',
      data: { invite_id: 'invite-1' },
    });
    expect(stubs.remove).toHaveBeenCalled();
    expect(response.status).toBe(500);
  });

  it('adds existing auth user directly to team', async () => {
    const { client, stubs } = createInvitesPostClient({ members: [], registeredUser: true });
    const inviteUserByEmail = vi.fn();
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(createAdminClient).mockReturnValue({
      auth: {
        admin: {
          inviteUserByEmail,
        },
      },
    } as never);

    const response = await postInvite(jsonRequest({ email: 'person@example.com' }), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(stubs.addRegisteredUserRpc).toHaveBeenCalledWith({
      p_invite_id: 'invite-1',
      p_team_id: VALID_ID,
    });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ status: 'added', message: 'User added to team' });
  });

  it('adds a user who registers while their invitation is being sent', async () => {
    const { client, stubs } = createInvitesPostClient({ members: [] });
    stubs.addRegisteredUserRpc
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    vi.mocked(createClient).mockResolvedValue(client as never);
    vi.mocked(createAdminClient).mockReturnValue({
      auth: {
        admin: {
          inviteUserByEmail: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'A user with this email address has already been registered' },
          }),
        },
      },
    } as never);

    const response = await postInvite(jsonRequest({ email: 'person@example.com' }), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(stubs.addRegisteredUserRpc).toHaveBeenCalledTimes(2);
    expect(stubs.remove).not.toHaveBeenCalled();
    expect(response.status).toBe(201);
  });

  it('supports the legacy Supabase response for an existing user', async () => {
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

    expect(stubs.acceptInviteRpc).toHaveBeenCalledWith({
      p_invite_id: 'invite-1',
      p_team_id: VALID_ID,
      p_user_id: 'u-2',
    });
    expect(response.status).toBe(201);
  });

  it('returns 404 when cancel invite cannot find row', async () => {
    const secondEq = vi.fn().mockResolvedValue({ error: { code: 'PGRST116' } });
    const remove = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: secondEq }) });
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ delete: remove }) } as never);
    const response = await deleteInvite(new Request('http://localhost/api/test'), {
      params: Promise.resolve({ id: VALID_ID, inviteId: VALID_ID }),
    });
    expect(response.status).toBe(404);
  });

  it('returns 400 when remove_team_member returns domain error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { error: 'Cannot remove owner' }, error: null });
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);
    const response = await deleteMember(new Request('http://localhost/api/test'), {
      params: Promise.resolve({ id: VALID_ID, userId: VALID_ID }),
    });
    expect(response.status).toBe(400);
  });
});
