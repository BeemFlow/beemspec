import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id, userId } = await params;
  if (!isValidUuid(id) || !isValidUuid(userId)) return invalidIdResponse();

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
