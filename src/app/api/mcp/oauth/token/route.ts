import { NextResponse } from 'next/server';
import { consumeAuthorizationCode, isSameMcpRedirectUri, verifyPkceS256 } from '@/integrations/mcp/oauth';
import { refreshSupabaseAccessToken } from '@/lib/supabase/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokenError(error: string, description: string, status = 400) {
  return NextResponse.json(
    {
      error,
      error_description: description,
    },
    { status },
  );
}

function logMcpToken(level: 'info' | 'warn' | 'error', message: string, data: Record<string, unknown>) {
  const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  logger('[mcp-oauth-token]', message, data);
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

async function handleAuthorizationCodeGrant(form: FormData) {
  const code = String(form.get('code') ?? '');
  const clientId = String(form.get('client_id') ?? '');
  const redirectUri = String(form.get('redirect_uri') ?? '');
  const codeVerifier = String(form.get('code_verifier') ?? '');

  if (!code || !clientId || !redirectUri || !codeVerifier) {
    return tokenError('invalid_request', 'Missing required authorization_code grant parameters');
  }

  const record = consumeAuthorizationCode(code);
  if (!record) {
    return tokenError('invalid_grant', 'Authorization code is invalid or expired');
  }

  if (record.clientId !== clientId || !isSameMcpRedirectUri(record.redirectUri, redirectUri)) {
    return tokenError('invalid_grant', 'Client or redirect mismatch');
  }

  if (!verifyPkceS256(codeVerifier, record.codeChallenge)) {
    return tokenError('invalid_grant', 'PKCE verification failed');
  }

  const refreshed = await refreshSupabaseAccessToken(record.refreshToken);
  if (refreshed.error || !refreshed.data) {
    logMcpToken('warn', 'auth_code_refresh_failed', {
      reason: refreshed.error instanceof Error ? refreshed.error.message : 'unknown',
    });
    return tokenError('invalid_grant', 'Failed to exchange refresh token', 401);
  }

  return NextResponse.json(refreshed.data);
}

async function handleRefreshTokenGrant(form: FormData) {
  const refreshToken = String(form.get('refresh_token') ?? '');
  if (!refreshToken) {
    return tokenError('invalid_request', 'refresh_token is required');
  }

  const refreshed = await refreshSupabaseAccessToken(refreshToken);
  if (refreshed.error || !refreshed.data) {
    logMcpToken('warn', 'refresh_grant_failed', {
      reason: refreshed.error instanceof Error ? refreshed.error.message : 'unknown',
    });
    return tokenError('invalid_grant', 'Refresh token is invalid', 401);
  }

  return NextResponse.json(refreshed.data);
}

export async function POST(request: Request) {
  const form = await parseTokenPayload(request);
  const grantType = String(form.get('grant_type') ?? '');

  logMcpToken('info', 'token_request', {
    grant_type: grantType || null,
    has_code: Boolean(form.get('code')),
    has_refresh_token: Boolean(form.get('refresh_token')),
    has_client_id: Boolean(form.get('client_id')),
  });

  if (grantType === 'authorization_code') {
    return handleAuthorizationCodeGrant(form);
  }

  if (grantType === 'refresh_token') {
    return handleRefreshTokenGrant(form);
  }

  return tokenError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
}
