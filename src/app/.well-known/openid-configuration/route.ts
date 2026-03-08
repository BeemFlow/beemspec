import { NextResponse } from 'next/server';
import { buildOAuthAuthorizationServerMetadata } from '../../../integrations/mcp/metadata';
import { resolveRequestOrigin } from '../../../integrations/mcp/origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const origin = resolveRequestOrigin(request);
  return NextResponse.json(buildOAuthAuthorizationServerMetadata(origin));
}
