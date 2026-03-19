import { updateProcessFlowSchema } from '@beemspec/processflow';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getE2EProcessFlow, updateE2EProcessFlow } from '@/lib/e2e/test-store';
import { env } from '@/lib/env';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';
import { buildProcessFlowFull, deleteProcessFlow, getProcessFlowGraph, updateProcessFlow } from '@/processflow/service';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (env.e2eTestMode()) {
    const { id } = await params;
    if (!isValidUuid(id) && !id.startsWith('flow-')) return invalidIdResponse();
    const flow = getE2EProcessFlow(id);
    return flow ? NextResponse.json(flow) : notFoundResponse('Process flow');
  }

  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = await createClient();
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
  if (env.e2eTestMode()) {
    const { id } = await params;
    const validation = await validateRequest(request, updateProcessFlowSchema);
    if (!validation.success) return validation.response;
    const updated = updateE2EProcessFlow(id, validation.data);
    return updated ? NextResponse.json(updated) : notFoundResponse('Process flow');
  }

  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, updateProcessFlowSchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
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

  const supabase = await createClient();
  const { data, error } = await deleteProcessFlow(supabase, id);
  if (error) {
    if ((error as { code?: string } | null)?.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Process flow');
    }
    return serverErrorResponse('Failed to delete process flow', error);
  }

  return NextResponse.json({ success: true, deleted: data });
}
