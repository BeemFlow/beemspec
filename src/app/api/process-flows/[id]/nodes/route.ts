import { batchProcessFlowNodesBodySchema, createProcessFlowNodeBodySchema } from '@beemspec/processflow';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { batchMutateE2EProcessFlowNodes, createE2EProcessFlowNode } from '@/lib/e2e/test-store';
import { env } from '@/lib/env';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';
import { batchMutateProcessFlowNodes, createProcessFlowNode } from '@/processflow/service';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (env.e2eTestMode()) {
    const { id } = await params;
    const validation = await validateRequest(request, createProcessFlowNodeBodySchema);
    if (!validation.success) return validation.response;
    const node = createE2EProcessFlowNode({ process_flow_id: id, ...validation.data });
    return node ? NextResponse.json(node) : NextResponse.json({ error: 'Process flow not found' }, { status: 404 });
  }

  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, createProcessFlowNodeBodySchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await createProcessFlowNode(supabase, { process_flow_id: id, ...validation.data });
  if (error) return serverErrorResponse('Failed to create process flow node', error);

  return NextResponse.json(data);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (env.e2eTestMode()) {
    const { id } = await params;
    const body = (await request.json()) as {
      mutations?: Array<{ action: 'create' | 'update' | 'delete'; id?: string; payload?: unknown }>;
    };
    if (!Array.isArray(body.mutations) || body.mutations.length === 0) {
      return NextResponse.json({ error: 'mutations must be a non-empty array' }, { status: 400 });
    }
    return NextResponse.json(batchMutateE2EProcessFlowNodes(id, body.mutations));
  }

  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, batchProcessFlowNodesBodySchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await batchMutateProcessFlowNodes(supabase, { process_flow_id: id, ...validation.data });
  if (error) return serverErrorResponse('Failed to mutate process flow nodes', error);

  return NextResponse.json(data);
}
