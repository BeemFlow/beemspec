import { NextResponse } from 'next/server';
import { buildMcpResourceUrl, MCP_DEFAULT_RESOURCE_PATH } from '@/integrations/mcp/metadata';
import {
  consumeAuthorizationCode,
  isSameMcpRedirectUri,
  isSameMcpResourceUri,
  verifyPkceS256,
} from '@/integrations/mcp/oauth';
import { resolveRequestOrigin } from '@/integrations/mcp/origin';
import { refreshSupabaseAccessToken } from '@/lib/supabase/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokenError(error: string, description: string, status = 400) {
  return NextResponse.json(
    {
      error,
      error_description: description,
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
    },
  );
}

function tokenSuccess(payload: unknown) {
  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
  });
}

async function parseTokenPayload(request: Request): Promise<FormData> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await request.json()) as Record<string, unknown>;
    const form = new FormData();
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        form.set(key, String(value));
      }
    }
    return form;
  }

  return request.formData();
}

function readAuthorizationCodeGrantParams(form: FormData) {
  return {
    code: String(form.get('code') ?? ''),
    clientId: String(form.get('client_id') ?? ''),
    redirectUri: String(form.get('redirect_uri') ?? ''),
    codeVerifier: String(form.get('code_verifier') ?? ''),
    resource: String(form.get('resource') ?? ''),
  };
}

function validateAuthorizationCodeGrantParams(params: ReturnType<typeof readAuthorizationCodeGrantParams>) {
  if (!params.code || !params.clientId || !params.redirectUri || !params.codeVerifier) {
    return tokenError('invalid_request', 'Missing required authorization_code grant parameters');
  }

  return null;
}

function resolveRequestedResource(resource: string, expectedResource: string): string | null {
  const requestedResource = resource || expectedResource;
  if (!isSameMcpResourceUri(requestedResource, expectedResource)) {
    return null;
  }

  return requestedResource;
}

async function handleAuthorizationCodeGrant(form: FormData, expectedResource: string) {
  const params = readAuthorizationCodeGrantParams(form);
  const paramsError = validateAuthorizationCodeGrantParams(params);
  if (paramsError) return paramsError;

  const record = await consumeAuthorizationCode(params.code);
  if (!record) {
    return tokenError('invalid_grant', 'Authorization code is invalid or expired');
  }

  if (record.clientId !== params.clientId || !isSameMcpRedirectUri(record.redirectUri, params.redirectUri)) {
    return tokenError('invalid_grant', 'Client or redirect mismatch');
  }

  if (!verifyPkceS256(params.codeVerifier, record.codeChallenge)) {
    return tokenError('invalid_grant', 'PKCE verification failed');
  }

  const requestedResource = resolveRequestedResource(params.resource, expectedResource);
  if (!requestedResource) {
    return tokenError('invalid_target', 'resource does not match this MCP server');
  }

  if (record.resource && !isSameMcpResourceUri(record.resource, requestedResource)) {
    return tokenError('invalid_grant', 'resource mismatch');
  }

  const refreshed = await refreshSupabaseAccessToken(record.refreshToken);
  if (refreshed.error || !refreshed.data) {
    return tokenError('invalid_grant', 'Failed to exchange refresh token');
  }

  return tokenSuccess(refreshed.data);
}

async function handleRefreshTokenGrant(form: FormData, expectedResource: string) {
  const refreshToken = String(form.get('refresh_token') ?? '');
  const resource = String(form.get('resource') ?? '');
  if (!refreshToken) {
    return tokenError('invalid_request', 'refresh_token is required');
  }

  if (resource && !isSameMcpResourceUri(resource, expectedResource)) {
    return tokenError('invalid_target', 'resource does not match this MCP server');
  }

  const refreshed = await refreshSupabaseAccessToken(refreshToken);
  if (refreshed.error || !refreshed.data) {
    return tokenError('invalid_grant', 'Refresh token is invalid');
  }

  return tokenSuccess(refreshed.data);
}

export async function POST(request: Request) {
  const form = await parseTokenPayload(request);
  const grantType = String(form.get('grant_type') ?? '');
  const origin = resolveRequestOrigin(request);
  const expectedResource = buildMcpResourceUrl(origin, MCP_DEFAULT_RESOURCE_PATH);

  if (grantType === 'authorization_code') {
    return handleAuthorizationCodeGrant(form, expectedResource);
  }

  if (grantType === 'refresh_token') {
    return handleRefreshTokenGrant(form, expectedResource);
  }

  return tokenError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
}
