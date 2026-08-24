import { NextResponse } from 'next/server';
import { updateProcessFlowSchema } from '@/domain/process-flow';
import { requireAuth } from '@/lib/auth';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';
import { buildProcessFlowFull, deleteProcessFlow, getProcessFlowGraph, updateProcessFlow } from '@/processflow/service';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = auth.supabase;
  const { flowResult, nodesResult, edgesResult } = await getProcessFlowGraph(supabase, id);

  if (flowResult.error || !flowResult.data) {
    if ((flowResult.error as { code?: string } | null)?.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Process flow');
    }
    return serverErrorResponse('Failed to load process flow', flowResult.error);
  }
  if (nodesResult.error) return serverErrorResponse('Failed to load process flow nodes', nodesResult.error);
  if (edgesResult.error) return serverErrorResponse('Failed to load process flow edges', edgesResult.error);

  return NextResponse.json(buildProcessFlowFull(flowResult.data, nodesResult.data ?? [], edgesResult.data ?? []));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, updateProcessFlowSchema);
  if (!validation.success) return validation.response;

  const supabase = auth.supabase;
  const { data, error } = await updateProcessFlow(supabase, id, validation.data);
  if (error) {
    if ((error as { code?: string } | null)?.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Process flow');
    }
    return serverErrorResponse('Failed to update process flow', error);
  }

  return NextResponse.json(data);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = auth.supabase;
  const { data, error } = await deleteProcessFlow(supabase, id);
  if (error) {
    if ((error as { code?: string } | null)?.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Process flow');
    }
    return serverErrorResponse('Failed to delete process flow', error);
  }

  return NextResponse.json({ success: true, deleted: data });
}
