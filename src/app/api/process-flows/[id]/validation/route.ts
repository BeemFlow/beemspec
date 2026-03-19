import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { validateE2EProcessFlow } from '@/lib/e2e/processflow-store';
import { env } from '@/lib/env';
import { DbErrorCode, notFoundResponse, serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';
import { validateProcessFlowById } from '@/processflow/service';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (env.e2eTestMode()) {
    const { id } = await params;
    const validation = validateE2EProcessFlow(id);
    return validation ? NextResponse.json(validation) : notFoundResponse('Process flow');
  }

  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = await createClient();
  const { data, error } = await validateProcessFlowById(supabase, id);
  if (error) {
    if ((error as { code?: string } | null)?.code === DbErrorCode.NOT_FOUND) {
      return notFoundResponse('Process flow');
    }
    return serverErrorResponse('Failed to validate process flow', error);
  }

  return NextResponse.json(data);
}
