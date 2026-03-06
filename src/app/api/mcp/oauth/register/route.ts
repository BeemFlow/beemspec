import { NextResponse } from 'next/server';
import { registerMcpOAuthClient } from '@/integrations/mcp/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const redirectUris =
    typeof body === 'object' && body && Array.isArray(Reflect.get(body, 'redirect_uris'))
      ? (Reflect.get(body, 'redirect_uris') as unknown[])
      : null;

  if (!redirectUris || redirectUris.length === 0 || !redirectUris.every((uri) => typeof uri === 'string')) {
    return NextResponse.json({ error: 'redirect_uris must be a non-empty string array' }, { status: 400 });
  }

  const clientName =
    typeof body === 'object' && body && typeof Reflect.get(body, 'client_name') === 'string'
      ? (Reflect.get(body, 'client_name') as string)
      : undefined;

  const client = registerMcpOAuthClient({
    redirect_uris: redirectUris,
    client_name: clientName,
  });

  return NextResponse.json(client, { status: 201 });
}
