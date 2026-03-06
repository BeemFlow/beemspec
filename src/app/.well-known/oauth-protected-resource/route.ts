import { NextResponse } from 'next/server';
import { resolveRequestOrigin } from '@/integrations/mcp/origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const origin = resolveRequestOrigin(request);

  return NextResponse.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [`${origin}`],
    bearer_methods_supported: ['header'],
    scopes_supported: ['openid', 'email', 'profile'],
  });
}
