import { authenticateMcpRequest } from '@/integrations/mcp/auth';
import { applyMcpCorsHeaders, isTrustedRequestOrigin } from '@/integrations/mcp/origin';
import { mcpHandler } from '@/integrations/mcp/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleMcpHttpRequest(request: Request): Promise<Response> {
  if (!isTrustedRequestOrigin(request)) {
    return applyMcpCorsHeaders(Response.json({ error: 'Forbidden origin' }, { status: 403 }), request);
  }

  const authInfo = await authenticateMcpRequest(request);
  if (authInfo instanceof Response) {
    return applyMcpCorsHeaders(authInfo, request);
  }

  return applyMcpCorsHeaders(await mcpHandler.fetch(request, { authInfo }), request);
}

export async function GET(request: Request) {
  return handleMcpHttpRequest(request);
}

export async function POST(request: Request) {
  return handleMcpHttpRequest(request);
}

export async function DELETE(request: Request) {
  return handleMcpHttpRequest(request);
}

export async function OPTIONS(request: Request) {
  return applyMcpCorsHeaders(new Response(null, { status: 204 }), request);
}
