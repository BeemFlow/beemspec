import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

interface AcceptInviteBody {
  inviteId?: unknown;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as AcceptInviteBody | null;
  const inviteId = typeof body?.inviteId === 'string' ? body.inviteId : null;

  if (!inviteId) {
    return NextResponse.json({ error: 'Invalid invite id' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { data: invite, error: inviteError } = await adminClient
    .from('team_invites')
    .select('id, team_id, accepted_at')
    .eq('id', inviteId)
    .single();

  if (inviteError || !invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }

  if (invite.accepted_at) {
    return NextResponse.json({ success: true });
  }

  const { error: acceptError } = await supabase.rpc('accept_team_invite_member', {
    p_invite_id: invite.id,
    p_team_id: invite.team_id,
    p_user_id: user.id,
  });

  if (acceptError) {
    return NextResponse.json({ error: 'Failed to accept invite' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
