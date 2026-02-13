import { NextResponse } from 'next/server';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { requireAuthWithUuidParams } from '@/lib/route-guards';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  const guard = await requireAuthWithUuidParams(params, ['id', 'inviteId']);
  if (!guard.success) return guard.response;

  const { id: teamId, inviteId } = guard.params;

  const supabase = await createClient();
  const { error } = await supabase.from('team_invites').delete().eq('id', inviteId).eq('team_id', teamId);

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Invite');
    }
    return serverErrorResponse('Failed to cancel invite', error);
  }

  return NextResponse.json({ success: true });
}
