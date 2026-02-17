import { NextResponse } from 'next/server';
import { handleOpenCodeMcpRequest } from '@/integrations/opencode/mcp-server';
import { isAuthorizedByOpenCodeToken } from '@/integrations/opencode/session';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isMcpTokenRequired(): boolean {
  return Boolean(env.openCodeToken());
}

async function handle(request: Request): Promise<Response> {
  if (isMcpTokenRequired() && !isAuthorizedByOpenCodeToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return handleOpenCodeMcpRequest(request);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function DELETE(request: Request) {
  return handle(request);
}
