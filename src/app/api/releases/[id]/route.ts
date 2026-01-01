import { NextResponse } from 'next/server';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid, pickDefined, updateReleaseSchema, validateRequest } from '@/lib/validations';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, updateReleaseSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('releases')
    .update(pickDefined(validation.data))
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Release');
    }
    return serverErrorResponse('Failed to update release', error);
  }
  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = await createClient();
  const { data, error } = await supabase.from('releases').delete().eq('id', id).select().single();

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Release');
    }
    return serverErrorResponse('Failed to delete release', error);
  }
  return NextResponse.json({ success: true, deleted: data });
}
