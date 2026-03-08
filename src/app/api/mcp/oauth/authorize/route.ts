import { NextResponse } from 'next/server';
import { buildMcpResourceUrl, MCP_DEFAULT_RESOURCE_PATH } from '@/integrations/mcp/metadata';
import { isSameMcpResourceUri, issueAuthorizationCode, validateRegisteredClient } from '@/integrations/mcp/oauth';
import { resolveRequestOrigin } from '@/integrations/mcp/origin';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function invalidRequest(description: string) {
  return NextResponse.json({ error: 'invalid_request', error_description: description }, { status: 400 });
}

function getAuthorizeParams(url: URL) {
  return {
    responseType: url.searchParams.get('response_type'),
    clientId: url.searchParams.get('client_id') ?? '',
    redirectUri: url.searchParams.get('redirect_uri') ?? '',
    state: url.searchParams.get('state') ?? '',
    scope: url.searchParams.get('scope') ?? '',
    resource: url.searchParams.get('resource') ?? '',
    codeChallenge: url.searchParams.get('code_challenge') ?? '',
    codeChallengeMethod: url.searchParams.get('code_challenge_method') ?? '',
  };
}

async function validateAuthorizeParams(params: ReturnType<typeof getAuthorizeParams>, expectedResource: string) {
  if (params.responseType !== 'code') return invalidRequest('response_type must be code');
  if (!params.clientId) return invalidRequest('client_id is required');
  if (!params.redirectUri) return invalidRequest('redirect_uri is required');
  if (!params.codeChallenge || params.codeChallengeMethod !== 'S256') {
    return invalidRequest('PKCE S256 is required');
  }

  const clientCheck = await validateRegisteredClient(params.clientId, params.redirectUri);
  if (!clientCheck.valid) {
    return NextResponse.json({ error: 'invalid_client', error_description: clientCheck.reason }, { status: 400 });
  }

  if (params.resource && !isSameMcpResourceUri(params.resource, expectedResource)) {
    return NextResponse.json(
      {
        error: 'invalid_target',
        error_description: 'resource does not match this MCP server',
      },
      { status: 400 },
    );
  }

  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = getAuthorizeParams(url);
  const origin = resolveRequestOrigin(request);
  const expectedResource = buildMcpResourceUrl(origin, MCP_DEFAULT_RESOURCE_PATH);
  const validationError = await validateAuthorizeParams(params, expectedResource);
  if (validationError) return validationError;

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('next', request.url);
    return NextResponse.redirect(loginUrl);
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.refresh_token) {
    return NextResponse.json({ error: 'access_denied', error_description: 'No active refresh token' }, { status: 401 });
  }

  const code = await issueAuthorizationCode({
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    userId: user.id,
    refreshToken: session.refresh_token,
    resource: params.resource || expectedResource,
  });

  const redirect = new URL(params.redirectUri);
  redirect.searchParams.set('code', code);
  if (params.state) redirect.searchParams.set('state', params.state);

  return NextResponse.redirect(redirect);
}
