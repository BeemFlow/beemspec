import { NextResponse } from 'next/server';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid, pickDefined, updateStorySchema, validateRequest } from '@/lib/validations';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = await createClient();
  const { data, error } = await supabase.from('stories').select('*').eq('id', id).single();

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Story');
    }
    return serverErrorResponse('Failed to load story', error);
  }
  return NextResponse.json(data);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, updateStorySchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const updateData = {
    ...pickDefined(validation.data),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('stories').update(updateData).eq('id', id).select().single();

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Story');
    }
    return serverErrorResponse('Failed to update story', error);
  }
  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = await createClient();
  const { data, error } = await supabase.from('stories').delete().eq('id', id).select().single();

  if (error) {
    if (error.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Story');
    }
    return serverErrorResponse('Failed to delete story', error);
  }
  return NextResponse.json({ success: true, deleted: data });
}
