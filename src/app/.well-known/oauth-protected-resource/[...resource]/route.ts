import { NextResponse } from 'next/server';
import { buildProtectedResourceMetadata } from '../../../../integrations/mcp/metadata';
import { resolveRequestOrigin } from '../../../../integrations/mcp/origin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ resource: string[] }> }) {
  const { resource } = await context.params;
  const origin = resolveRequestOrigin(request);
  const resourcePath = `/${resource.join('/')}`;

  return NextResponse.json(buildProtectedResourceMetadata(origin, resourcePath));
}
