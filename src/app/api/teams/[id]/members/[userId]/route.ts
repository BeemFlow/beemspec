import { NextResponse } from 'next/server';
import { serverErrorResponse } from '@/lib/errors';
import { requireAuthWithUuidParams } from '@/lib/route-guards';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const guard = await requireAuthWithUuidParams(params, ['id', 'userId']);
  if (!guard.success) return guard.response;

  const { id, userId } = guard.params;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('remove_team_member', {
    p_team_id: id,
    p_user_id: userId,
  });

  if (error) {
    return serverErrorResponse('Failed to remove member', error);
  }

  if (data?.error) {
    return NextResponse.json({ error: data.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
