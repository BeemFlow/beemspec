import { NextResponse } from 'next/server';
import { batchProcessFlowEdgesBodySchema, createProcessFlowEdgeBodySchema } from '@/domain/process-flow';
import { requireAuth } from '@/lib/auth';
import { serverErrorResponse } from '@/lib/errors';
import { invalidIdResponse, isValidUuid, validateRequest } from '@/lib/validations';
import { batchMutateProcessFlowEdges, createProcessFlowEdge } from '@/processflow/service';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, createProcessFlowEdgeBodySchema);
  if (!validation.success) return validation.response;

  const supabase = auth.supabase;
  const { data, error } = await createProcessFlowEdge(supabase, { process_flow_id: id, ...validation.data });
  if (error) return serverErrorResponse('Failed to create process flow edge', error);

  return NextResponse.json(data);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const validation = await validateRequest(request, batchProcessFlowEdgesBodySchema);
  if (!validation.success) return validation.response;

  const supabase = auth.supabase;
  const { data, error } = await batchMutateProcessFlowEdges(supabase, { process_flow_id: id, ...validation.data });
  if (error) return serverErrorResponse('Failed to mutate process flow edges', error);

  return NextResponse.json(data);
}
