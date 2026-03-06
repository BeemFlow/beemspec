import { authenticateMcpRequest } from '@/integrations/mcp/auth';
import { handleMcpRequest } from '@/integrations/mcp/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  const auth = await authenticateMcpRequest(request);
  if (!auth.ok) {
    return auth.response;
  }

  return handleMcpRequest(request, auth.supabase, auth.user);
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
