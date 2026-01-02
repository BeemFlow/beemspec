import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

async function clearInviteAndRedirect(supabase: Awaited<ReturnType<typeof createClient>>) {
  await supabase.auth.updateUser({ data: { invite_id: null } });
  redirect('/');
}

export default async function AcceptInvitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/auth/login');
  }

  const inviteId = user.user_metadata?.invite_id;
  if (!inviteId) {
    redirect('/');
  }

  // Look up the invite
  const { data: invite } = await supabase
    .from('team_invites')
    .select('*')
    .eq('id', inviteId)
    .is('accepted_at', null)
    .single();

  // Invalid invite: not found, already accepted, or email mismatch
  if (!invite || invite.email.toLowerCase() !== user.email?.toLowerCase()) {
    return clearInviteAndRedirect(supabase);
  }

  // Add user to team (ignore duplicate key error code 23505)
  const { error: memberError } = await supabase.from('team_members').insert({
    team_id: invite.team_id,
    user_id: user.id,
    role: 'member',
  });

  if (memberError && memberError.code !== '23505') {
    return clearInviteAndRedirect(supabase);
  }

  // Mark invite as accepted
  await supabase.from('team_invites').update({ accepted_at: new Date().toISOString() }).eq('id', inviteId);

  return clearInviteAndRedirect(supabase);
}
