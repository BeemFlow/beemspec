import { redirect } from 'next/navigation';
import { acceptE2ETeamInvite } from '@/lib/e2e/test-store';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

async function clearInviteAndRedirect(supabase: Awaited<ReturnType<typeof createClient>>) {
  await supabase.auth.updateUser({ data: { invite_id: null } });
  redirect('/');
}

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (env.e2eTestMode()) {
    const resolvedSearchParams = searchParams ? await searchParams : {};
    const inviteId = resolvedSearchParams.invite_id;
    const email = resolvedSearchParams.email;

    if (typeof inviteId === 'string' && typeof email === 'string') {
      acceptE2ETeamInvite(inviteId, email);
    }

    redirect('/');
  }

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

  const { error: acceptError } = await supabase.rpc('accept_team_invite_member', {
    p_invite_id: invite.id,
    p_team_id: invite.team_id,
    p_user_id: user.id,
  });

  if (acceptError) {
    return clearInviteAndRedirect(supabase);
  }

  return clearInviteAndRedirect(supabase);
}
