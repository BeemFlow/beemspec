import { NextResponse } from 'next/server';
import { getSessionContextBySessionId } from '@/integrations/opencode/queries';
import { isAuthorizedByOpenCodeToken } from '@/integrations/opencode/session';
import { serverErrorResponse } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!isAuthorizedByOpenCodeToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sessionId } = await params;
  if (!sessionId || sessionId.trim().length === 0) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const context = await getSessionContextBySessionId(createAdminClient(), sessionId);
    return NextResponse.json(context);
  } catch (error) {
    return serverErrorResponse('Failed to load session context', error);
  }
}
