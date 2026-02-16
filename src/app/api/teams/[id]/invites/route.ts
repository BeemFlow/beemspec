import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, inviteEmailSchema, isValidUuid, validateRequest } from '@/lib/validations';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('team_invites')
    .select('*')
    .eq('team_id', id)
    .is('accepted_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    return serverErrorResponse('Failed to fetch invites', error);
  }

  return NextResponse.json(data);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id: teamId } = await params;
  if (!isValidUuid(teamId)) return invalidIdResponse();

  const validation = await validateRequest(request, inviteEmailSchema);
  if (!validation.success) return validation.response;

  const email = validation.data.email.toLowerCase();
  const supabase = await createClient();

  // Check if already a member
  const { data: existingMember } = await supabase.rpc('get_team_members', { p_team_id: teamId });
  if (existingMember?.some((m: { email: string }) => m.email.toLowerCase() === email)) {
    return NextResponse.json({ error: 'User is already a team member' }, { status: 400 });
  }

  // Check if invite already pending
  const { data: existingInvite } = await supabase
    .from('team_invites')
    .select('id')
    .eq('team_id', teamId)
    .eq('email', email)
    .is('accepted_at', null)
    .single();

  if (existingInvite) {
    return NextResponse.json({ error: 'Invite already pending for this email' }, { status: 400 });
  }

  // Create invite record
  const { data: invite, error: inviteError } = await supabase
    .from('team_invites')
    .insert({ team_id: teamId, email, invited_by: auth.user.id })
    .select()
    .single();

  if (inviteError) {
    return serverErrorResponse('Failed to create invite', inviteError);
  }

  // Get origin for redirect URL
  const headersList = await headers();
  const host = headersList.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const origin = `${protocol}://${host}`;

  // Call Supabase inviteUserByEmail
  const adminClient = createAdminClient();
  const { data: inviteResult, error: authError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/invite/accept`,
    data: { invite_id: invite.id },
  });

  if (authError) {
    // Rollback invite record
    await supabase.from('team_invites').delete().eq('id', invite.id);
    return serverErrorResponse('Failed to send invite', authError);
  }

  // Check if user already exists (empty identities array)
  if (inviteResult.user?.identities?.length === 0) {
    // User exists - add directly to team
    const { error: memberError } = await supabase.from('team_members').insert({
      team_id: teamId,
      user_id: inviteResult.user.id,
      role: 'member',
    });

    if (memberError) {
      return serverErrorResponse('Failed to add member', memberError);
    }

    // Mark invite as accepted
    await supabase.from('team_invites').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id);

    return NextResponse.json({ status: 'added', message: 'User added to team' }, { status: 201 });
  }

  return NextResponse.json({ status: 'invited', message: 'Invitation sent' }, { status: 201 });
}
