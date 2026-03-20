import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!user.email) {
    return NextResponse.json({ error: 'Missing user email' }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: invites, error: inviteError } = await adminClient
    .from('team_invites')
    .select('id, team_id, accepted_at, email')
    .ilike('email', user.email)
    .is('accepted_at', null)
    .order('created_at', { ascending: true });

  if (inviteError) {
    return NextResponse.json({ error: 'Failed to load invites' }, { status: 500 });
  }

  const pendingInvites = invites ?? [];

  if (pendingInvites.length === 0) {
    return NextResponse.json({ success: true, accepted: 0 });
  }

  for (const invite of pendingInvites) {
    const { error: acceptError } = await supabase.rpc('accept_team_invite_member', {
      p_invite_id: invite.id,
      p_team_id: invite.team_id,
      p_user_id: user.id,
    });

    if (acceptError) {
      return NextResponse.json({ error: 'Failed to accept invite' }, { status: 400 });
    }
  }

  return NextResponse.json({ success: true, accepted: pendingInvites.length });
}
