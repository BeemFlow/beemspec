import { NextResponse } from 'next/server';
import { updateProcessFlowSchema } from '@/domain/process-flow';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';
import { ProcessFlowDocumentError } from '@/processflow/document';
import { deleteProcessFlow, getProcessFlow, updateProcessFlow } from '@/processflow/service';

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Context) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const { data, error } = await getProcessFlow(auth.supabase, id);
  if (error && error.code !== DbErrorCode.NOT_FOUND) return serverErrorResponse('Failed to load process flow', error);
  return data ? NextResponse.json(data) : notFoundResponse('Process flow');
}

export async function PUT(request: Request, { params }: Context) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, updateProcessFlowSchema);
  if (!validation.success) return validation.response;

  try {
    const { data, error } = await updateProcessFlow(auth.supabase, id, validation.data);
    if (error && error.code !== DbErrorCode.NOT_FOUND)
      return serverErrorResponse('Failed to update process flow', error);
    return data ? NextResponse.json(data) : notFoundResponse('Process flow');
  } catch (error) {
    if (error instanceof ProcessFlowDocumentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return serverErrorResponse('Failed to update process flow', error);
  }
}

export async function DELETE(_: Request, { params }: Context) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;
  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const { data, error } = await deleteProcessFlow(auth.supabase, id);
  if (error && error.code !== DbErrorCode.NOT_FOUND) return serverErrorResponse('Failed to delete process flow', error);
  return data ? NextResponse.json({ success: true, deleted: data }) : notFoundResponse('Process flow');
}
