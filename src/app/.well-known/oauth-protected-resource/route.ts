import { NextResponse } from 'next/server';
import { buildProtectedResourceMetadata, MCP_DEFAULT_RESOURCE_PATH } from '@/integrations/mcp/metadata';
import { resolveRequestOrigin } from '@/integrations/mcp/origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const origin = resolveRequestOrigin(request);
  return NextResponse.json(buildProtectedResourceMetadata(origin, MCP_DEFAULT_RESOURCE_PATH));
}
