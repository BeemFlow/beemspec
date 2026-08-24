import { NextResponse } from 'next/server';
import { updateTeamSchema } from '@/app/api/teams/schemas';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, updateTeamSchema);
  if (!validation.success) return validation.response;

  const supabase = auth.supabase;
  const { data, error } = await supabase
    .from('teams')
    .update({ name: validation.data.name, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Team');
    }
    return serverErrorResponse('Failed to update team', error);
  }
  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = auth.supabase;

  // RLS enforces owner-only deletion
  const { error } = await supabase.from('teams').delete().eq('id', id);

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Team');
    }
    return serverErrorResponse('Failed to delete team', error);
  }

  return NextResponse.json({ success: true });
}
