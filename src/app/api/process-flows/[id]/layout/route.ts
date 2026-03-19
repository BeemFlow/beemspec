import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { autolayoutE2EProcessFlow } from '@/lib/e2e/processflow-store';
import { env } from '@/lib/env';
import { serverErrorResponse } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';
import { autolayoutProcessFlow } from '@/processflow/service';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (env.e2eTestMode()) {
    const { id } = await params;
    const layouted = autolayoutE2EProcessFlow(id);
    return layouted
      ? NextResponse.json(layouted)
      : NextResponse.json({ error: 'Process flow not found' }, { status: 404 });
  }

  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) return invalidIdResponse();

  const supabase = await createClient();
  const { data, error } = await autolayoutProcessFlow(supabase, id);
  if (error) return serverErrorResponse('Failed to auto-layout process flow', error);

  return NextResponse.json(data);
}
