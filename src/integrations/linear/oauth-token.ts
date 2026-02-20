import { env } from '@/lib/env';

const LINEAR_OAUTH_AUTHORIZE_URL = 'https://linear.app/oauth/authorize';
const LINEAR_OAUTH_TOKEN_URL = 'https://api.linear.app/oauth/token';
const DEFAULT_LINEAR_OAUTH_SCOPES = ['read', 'write'] as const;

interface LinearOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface LinearOAuthTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  token_type?: unknown;
  scope?: unknown;
  expires_in?: unknown;
  error?: unknown;
  error_description?: unknown;
}

export interface LinearOAuthToken {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string | null;
  scope: string | null;
  expiresIn: number | null;
}

function getLinearOAuthConfig(): LinearOAuthConfig {
  const clientId = env.linearClientId();
  const clientSecret = env.linearClientSecret();
  const redirectUri = env.linearOAuthRedirectUri();

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Linear OAuth environment variables');
  }

  return { clientId, clientSecret, redirectUri };
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asPositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function parseTokenPayload(payload: LinearOAuthTokenResponse): LinearOAuthToken {
  const accessToken = asNonEmptyString(payload.access_token);
  if (!accessToken) {
    const error =
      asNonEmptyString(payload.error_description) ?? asNonEmptyString(payload.error) ?? 'OAuth token missing';
    throw new Error(`Linear OAuth token exchange failed: ${error}`);
  }

  return {
    accessToken,
    refreshToken: asNonEmptyString(payload.refresh_token),
    tokenType: asNonEmptyString(payload.token_type),
    scope: asNonEmptyString(payload.scope),
    expiresIn: asPositiveNumber(payload.expires_in),
  };
}

async function requestToken(params: URLSearchParams): Promise<LinearOAuthToken> {
  const response = await fetch(LINEAR_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: params,
    cache: 'no-store',
  });

  let payload: LinearOAuthTokenResponse = {};
  try {
    payload = (await response.json()) as LinearOAuthTokenResponse;
  } catch {}

  if (!response.ok) {
    const description =
      asNonEmptyString(payload.error_description) ?? asNonEmptyString(payload.error) ?? `status ${response.status}`;
    throw new Error(`Linear OAuth token request failed: ${description}`);
  }

  return parseTokenPayload(payload);
}

export function createLinearOAuthAuthorizeUrl(input: { state: string; scopes?: readonly string[] }): string {
  const config = getLinearOAuthConfig();
  const scopes = input.scopes && input.scopes.length > 0 ? input.scopes : DEFAULT_LINEAR_OAUTH_SCOPES;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: scopes.join(','),
    state: input.state,
  });

  return `${LINEAR_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeLinearOAuthCode(code: string): Promise<LinearOAuthToken> {
  const config = getLinearOAuthConfig();
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  return requestToken(params);
}

export async function refreshLinearOAuthAccessToken(refreshToken: string): Promise<LinearOAuthToken> {
  const config = getLinearOAuthConfig();
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  return requestToken(params);
}
