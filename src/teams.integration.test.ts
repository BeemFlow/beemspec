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

  it('lets an owner add an already-registered user by invite email', async () => {
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
      .select('id')
      .single();
    expect(inviteInsert.error).toBeNull();

    const ownerClient = createPublicClient();
    const signIn = await ownerClient.auth.signInWithPassword({
      email: E2E_OWNER_EMAIL,
      password: E2E_OWNER_PASSWORD,
    });
    expect(signIn.error).toBeNull();

    const addMember = await ownerClient.rpc('add_registered_user_to_team', {
      p_invite_id: inviteInsert.data?.id,
      p_team_id: E2E_TEAM_ID,
    });
    expect(addMember.error).toBeNull();
    expect(addMember.data).toBe(true);

    const memberLookup = await admin
      .from('team_members')
      .select('role')
      .eq('team_id', E2E_TEAM_ID)
      .eq('user_id', invitee.id)
      .single();
    expect(memberLookup.error).toBeNull();
    expect(memberLookup.data?.role).toBe('member');
  });

  it('restricts role changes to owners and preserves at least one owner', async () => {
    const admin = createAdminClient();
    const invitee = await ensureLocalAuthUser(admin, {
      email: E2E_INVITEE_EMAIL,
      password: E2E_INVITEE_PASSWORD,
      fullName: 'Invitee Example',
    });
    const insertMember = await admin
      .from('team_members')
      .insert({ team_id: E2E_TEAM_ID, user_id: invitee.id, role: 'member' });
    expect(insertMember.error).toBeNull();

    const ownerClient = createPublicClient();
    const ownerSignIn = await ownerClient.auth.signInWithPassword({
      email: E2E_OWNER_EMAIL,
      password: E2E_OWNER_PASSWORD,
    });
    expect(ownerSignIn.error).toBeNull();

    const memberClient = createPublicClient();
    const memberSignIn = await memberClient.auth.signInWithPassword({
      email: E2E_INVITEE_EMAIL,
      password: E2E_INVITEE_PASSWORD,
    });
    expect(memberSignIn.error).toBeNull();

    const unauthorizedPromotion = await memberClient.rpc('update_team_member_role', {
      p_team_id: E2E_TEAM_ID,
      p_user_id: invitee.id,
      p_role: 'owner',
    });
    expect(unauthorizedPromotion.error).toBeNull();
    expect(unauthorizedPromotion.data).toEqual({ error: 'Only team owners can change member roles' });

    const promotion = await ownerClient.rpc('update_team_member_role', {
      p_team_id: E2E_TEAM_ID,
      p_user_id: invitee.id,
      p_role: 'owner',
    });
    expect(promotion.error).toBeNull();
    expect(promotion.data).toEqual({ success: true, role: 'owner' });

    const demotion = await ownerClient.rpc('update_team_member_role', {
      p_team_id: E2E_TEAM_ID,
      p_user_id: invitee.id,
      p_role: 'member',
    });
    expect(demotion.error).toBeNull();
    expect(demotion.data).toEqual({ success: true, role: 'member' });

    const onlyOwner = await findUserByEmail(admin, E2E_OWNER_EMAIL);
    if (!onlyOwner) throw new Error('Expected seeded owner auth user to exist');

    const lastOwnerDemotion = await ownerClient.rpc('update_team_member_role', {
      p_team_id: E2E_TEAM_ID,
      p_user_id: onlyOwner.id,
      p_role: 'member',
    });
    expect(lastOwnerDemotion.error).toBeNull();
    expect(lastOwnerDemotion.data).toEqual({ error: 'A team must have at least one owner' });

    const lastOwnerRemoval = await ownerClient.rpc('remove_team_member', {
      p_team_id: E2E_TEAM_ID,
      p_user_id: onlyOwner.id,
    });
    expect(lastOwnerRemoval.error).toBeNull();
    expect(lastOwnerRemoval.data).toEqual({ error: 'A team must have at least one owner' });

    const ownerLookup = await admin
      .from('team_members')
      .select('role')
      .eq('team_id', E2E_TEAM_ID)
      .eq('user_id', onlyOwner.id)
      .single();
    expect(ownerLookup.error).toBeNull();
    expect(ownerLookup.data?.role).toBe('owner');
  });

  it('lets an owner remove another owner', async () => {
    const admin = createAdminClient();
    const invitee = await ensureLocalAuthUser(admin, {
      email: E2E_INVITEE_EMAIL,
      password: E2E_INVITEE_PASSWORD,
      fullName: 'Invitee Example',
    });
    const insertMember = await admin
      .from('team_members')
      .insert({ team_id: E2E_TEAM_ID, user_id: invitee.id, role: 'owner' });
    expect(insertMember.error).toBeNull();

    const ownerClient = createPublicClient();
    const signIn = await ownerClient.auth.signInWithPassword({
      email: E2E_OWNER_EMAIL,
      password: E2E_OWNER_PASSWORD,
    });
    expect(signIn.error).toBeNull();

    const removal = await ownerClient.rpc('remove_team_member', {
      p_team_id: E2E_TEAM_ID,
      p_user_id: invitee.id,
    });
    expect(removal.error).toBeNull();
    expect(removal.data).toEqual({ success: true });

    const removedMembership = await admin
      .from('team_members')
      .select('id')
      .eq('team_id', E2E_TEAM_ID)
      .eq('user_id', invitee.id)
      .maybeSingle();
    expect(removedMembership.error).toBeNull();
    expect(removedMembership.data).toBeNull();
  });
});
