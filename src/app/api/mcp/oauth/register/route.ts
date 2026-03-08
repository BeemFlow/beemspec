import { NextResponse } from 'next/server';
import { isAllowedMcpRedirectUri, normalizeMcpRedirectUri, registerMcpOAuthClient } from '@/integrations/mcp/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: 'invalid_client_metadata',
        error_description: 'Invalid JSON body',
      },
      { status: 400 },
    );
  }

  const redirectUris =
    typeof body === 'object' && body && Array.isArray(Reflect.get(body, 'redirect_uris'))
      ? (Reflect.get(body, 'redirect_uris') as unknown[])
      : null;

  if (!redirectUris || redirectUris.length === 0 || !redirectUris.every((uri) => typeof uri === 'string')) {
    return NextResponse.json(
      {
        error: 'invalid_redirect_uri',
        error_description: 'redirect_uris must be a non-empty string array',
      },
      { status: 400 },
    );
  }

  const normalizedRedirectUris = redirectUris
    .map((uri) => normalizeMcpRedirectUri(uri))
    .filter((uri): uri is string => !!uri);
  if (normalizedRedirectUris.length !== redirectUris.length) {
    return NextResponse.json(
      {
        error: 'invalid_redirect_uri',
        error_description: 'redirect_uris must be valid absolute URLs',
      },
      { status: 400 },
    );
  }

  if (!normalizedRedirectUris.every((uri) => isAllowedMcpRedirectUri(uri))) {
    return NextResponse.json(
      {
        error: 'invalid_redirect_uri',
        error_description: 'redirect_uris must use https or loopback http://localhost',
      },
      { status: 400 },
    );
  }

  const clientName =
    typeof body === 'object' && body && typeof Reflect.get(body, 'client_name') === 'string'
      ? (Reflect.get(body, 'client_name') as string)
      : undefined;

  const client = await registerMcpOAuthClient({
    redirect_uris: Array.from(new Set(normalizedRedirectUris)),
    client_name: clientName,
  });

  return NextResponse.json(client, { status: 201 });
}
