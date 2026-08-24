import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id: teamId, inviteId } = await params;
  if (!isValidUuid(teamId) || !isValidUuid(inviteId)) return invalidIdResponse();

  const supabase = auth.supabase;
  const { error } = await supabase.from('team_invites').delete().eq('id', inviteId).eq('team_id', teamId);

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Invite');
    }
    return serverErrorResponse('Failed to cancel invite', error);
  }

  return NextResponse.json({ success: true });
}
