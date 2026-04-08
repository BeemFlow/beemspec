import { beforeEach, describe, expect, it } from 'vitest';
import {
  createAdminClient,
  createPublicClient,
  E2E_INVITEE_EMAIL,
  E2E_INVITEE_PASSWORD,
  E2E_OWNER_EMAIL,
  E2E_OWNER_PASSWORD,
  E2E_TEAM_ID,
  ensureLocalAuthUser,
  findUserByEmail,
  resetLocalAppState,
} from '../e2e/local-fixtures';

describe.sequential('team membership integration', () => {
  beforeEach(async () => {
    await resetLocalAppState();
  });

  it('returns real team members for an authenticated owner', async () => {
    const ownerClient = createPublicClient();
    const signIn = await ownerClient.auth.signInWithPassword({
      email: E2E_OWNER_EMAIL,
      password: E2E_OWNER_PASSWORD,
    });
    expect(signIn.error).toBeNull();

    const members = await ownerClient.rpc('get_team_members', { p_team_id: E2E_TEAM_ID });

    expect(members.error).toBeNull();
    expect(members.data).toEqual([expect.objectContaining({ email: E2E_OWNER_EMAIL, role: 'owner' })]);
  });

  it('accepts a pending invite through the real database function', async () => {
    const admin = createAdminClient();
    const owner = await findUserByEmail(admin, E2E_OWNER_EMAIL);
    if (!owner) {
      throw new Error('Expected seeded owner auth user to exist');
    }

    const invitee = await ensureLocalAuthUser(admin, {
      email: E2E_INVITEE_EMAIL,
      password: E2E_INVITEE_PASSWORD,
      fullName: 'Invitee Example',
    });

    const inviteInsert = await admin
      .from('team_invites')
      .insert({ team_id: E2E_TEAM_ID, email: E2E_INVITEE_EMAIL, invited_by: owner.id })
      .select('id, accepted_at')
      .single();

    expect(inviteInsert.error).toBeNull();
    expect(inviteInsert.data?.accepted_at).toBeNull();

    const inviteeClient = createPublicClient();
    const signIn = await inviteeClient.auth.signInWithPassword({
      email: E2E_INVITEE_EMAIL,
      password: E2E_INVITEE_PASSWORD,
    });
    expect(signIn.error).toBeNull();

    const accept = await inviteeClient.rpc('accept_team_invite_member', {
      p_invite_id: inviteInsert.data?.id,
      p_team_id: E2E_TEAM_ID,
      p_user_id: invitee.id,
    });

    expect(accept.error).toBeNull();

    const memberLookup = await admin
      .from('team_members')
      .select('team_id, user_id, role')
      .eq('team_id', E2E_TEAM_ID)
      .eq('user_id', invitee.id)
      .maybeSingle();
    expect(memberLookup.error).toBeNull();
    expect(memberLookup.data).toMatchObject({ team_id: E2E_TEAM_ID, user_id: invitee.id, role: 'member' });

    const inviteLookup = await admin
      .from('team_invites')
      .select('accepted_at')
      .eq('id', inviteInsert.data?.id)
      .single();
    expect(inviteLookup.error).toBeNull();
    expect(inviteLookup.data?.accepted_at).not.toBeNull();
  });
});
