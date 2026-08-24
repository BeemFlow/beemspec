import { NextResponse } from 'next/server';
import { updateTeamMemberRoleSchema } from '@/app/api/teams/schemas';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { isTeamOwnerForRequest } from '@/lib/teams';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';

type MemberMutationData = { error?: string; role?: string; success?: boolean } | null;

function memberMutationResponse(data: MemberMutationData, error: unknown, failureMessage: string): NextResponse {
  if (error) return serverErrorResponse(failureMessage, error);
  if (data?.error) return NextResponse.json({ error: data.error }, { status: 400 });
  return NextResponse.json(data ?? { success: true });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id, userId } = await params;
  if (!isValidUuid(id) || !isValidUuid(userId)) return invalidIdResponse();

  const validation = await validateRequest(request, updateTeamMemberRoleSchema);
  if (!validation.success) return validation.response;

  if (!(await isTeamOwnerForRequest(auth.supabase, auth.user.id, id))) {
    return NextResponse.json({ error: 'Only team owners can change member roles' }, { status: 403 });
  }

  const { data, error } = await auth.supabase.rpc('update_team_member_role', {
    p_team_id: id,
    p_user_id: userId,
    p_role: validation.data.role,
  });

  return memberMutationResponse(data, error, 'Failed to update member role');
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id, userId } = await params;
  if (!isValidUuid(id) || !isValidUuid(userId)) return invalidIdResponse();

  const supabase = auth.supabase;
  if (!(await isTeamOwnerForRequest(supabase, auth.user.id, id))) {
    return NextResponse.json({ error: 'Only team owners can remove members' }, { status: 403 });
  }

  const { data, error } = await supabase.rpc('remove_team_member', {
    p_team_id: id,
    p_user_id: userId,
  });

  return memberMutationResponse(data, error, 'Failed to remove member');
}
