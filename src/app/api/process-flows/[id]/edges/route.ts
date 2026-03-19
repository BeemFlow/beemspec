import { batchProcessFlowEdgesBodySchema, createProcessFlowEdgeBodySchema } from '@beemspec/processflow';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { batchMutateE2EProcessFlowEdges, createE2EProcessFlowEdge } from '@/lib/e2e/test-store';
import { env } from '@/lib/env';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';
import { batchMutateProcessFlowEdges, createProcessFlowEdge } from '@/processflow/service';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (env.e2eTestMode()) {
    const { id } = await params;
    const body = (await request.json()) as {
      type?: string;
      source_node_id?: string;
      target_node_id?: string;
      data?: { label?: string | null; condition?: string | null } | null;
    };
    if (!body.type || !body.source_node_id || !body.target_node_id) {
      return NextResponse.json({ error: 'type, source_node_id, and target_node_id are required' }, { status: 400 });
    }
    const edge = createE2EProcessFlowEdge({
      process_flow_id: id,
      type: body.type as 'flow' | 'handoff' | 'exception' | 'dependency',
      source_node_id: body.source_node_id,
      target_node_id: body.target_node_id,
      data: body.data ?? null,
    });
    return edge
      ? NextResponse.json(edge)
      : NextResponse.json({ error: 'Failed to create process flow edge' }, { status: 400 });
  }

  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, createProcessFlowEdgeBodySchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await createProcessFlowEdge(supabase, { process_flow_id: id, ...validation.data });
  if (error) return serverErrorResponse('Failed to create process flow edge', error);

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
    return NextResponse.json(batchMutateE2EProcessFlowEdges(id, body.mutations));
  }

  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, batchProcessFlowEdgesBodySchema);
  if (!validation.success) return validation.response;

  const supabase = await createClient();
  const { data, error } = await batchMutateProcessFlowEdges(supabase, { process_flow_id: id, ...validation.data });
  if (error) return serverErrorResponse('Failed to mutate process flow edges', error);

  return NextResponse.json(data);
}
