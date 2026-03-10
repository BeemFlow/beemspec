import { NextResponse } from 'next/server';
import { buildMcpResourceUrl, MCP_DEFAULT_RESOURCE_PATH } from '@/integrations/mcp/metadata';
import {
  isSameMcpResourceUri,
  issueAuthorizationCode,
  issueAuthorizeConsentToken,
  validateRegisteredClient,
  verifyAuthorizeConsentToken,
} from '@/integrations/mcp/oauth';
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

function getAuthorizeParamsFromForm(form: FormData) {
  return {
    responseType: String(form.get('response_type') ?? ''),
    clientId: String(form.get('client_id') ?? ''),
    redirectUri: String(form.get('redirect_uri') ?? ''),
    state: String(form.get('state') ?? ''),
    scope: String(form.get('scope') ?? ''),
    resource: String(form.get('resource') ?? ''),
    codeChallenge: String(form.get('code_challenge') ?? ''),
    codeChallengeMethod: String(form.get('code_challenge_method') ?? ''),
  };
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function buildAuthorizeUrl(
  requestUrl: URL,
  params: ReturnType<typeof getAuthorizeParamsFromForm> | ReturnType<typeof getAuthorizeParams>,
) {
  const nextUrl = new URL(requestUrl.pathname, requestUrl);
  nextUrl.searchParams.set('response_type', params.responseType ?? '');
  nextUrl.searchParams.set('client_id', params.clientId);
  nextUrl.searchParams.set('redirect_uri', params.redirectUri);
  if (params.state) nextUrl.searchParams.set('state', params.state);
  if (params.scope) nextUrl.searchParams.set('scope', params.scope);
  if (params.resource) nextUrl.searchParams.set('resource', params.resource);
  nextUrl.searchParams.set('code_challenge', params.codeChallenge);
  nextUrl.searchParams.set('code_challenge_method', params.codeChallengeMethod);
  return nextUrl;
}

function renderConsentPage(request: Request, params: ReturnType<typeof getAuthorizeParams>, consentToken: string) {
  const requestUrl = new URL(request.url);
  const actionPath = requestUrl.pathname;
  const redirectHost = (() => {
    try {
      return new URL(params.redirectUri).host;
    } catch {
      return params.redirectUri;
    }
  })();

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorize MCP Client</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: linear-gradient(160deg, #f8fafc 0%, #eef2ff 100%);
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        color: #0f172a;
      }
      .card {
        width: min(560px, 100%);
        background: #ffffff;
        border: 1px solid #dbeafe;
        border-radius: 14px;
        box-shadow: 0 20px 44px rgba(15, 23, 42, 0.12);
        padding: 24px;
      }
      h1 { margin: 0 0 10px; font-size: 24px; line-height: 1.2; }
      p { margin: 0 0 14px; line-height: 1.5; }
      .details {
        margin: 16px 0;
        padding: 12px;
        border-radius: 10px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
      }
      .details p { margin: 0 0 8px; font-size: 14px; }
      .details p:last-child { margin-bottom: 0; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; word-break: break-all; }
      .actions { display: flex; gap: 10px; margin-top: 20px; }
      button {
        border: none;
        border-radius: 10px;
        padding: 10px 16px;
        font-weight: 600;
        cursor: pointer;
      }
      button[name="decision"][value="deny"] { background: #e2e8f0; color: #0f172a; }
      button[name="decision"][value="approve"] { background: #0f766e; color: #ffffff; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Authorize MCP access</h1>
      <p>This app is requesting access to your Beemspec MCP session. Review the details before continuing.</p>
      <div class="details">
        <p><strong>Client ID:</strong> <span class="mono">${escapeHtml(params.clientId)}</span></p>
        <p><strong>Redirect host:</strong> <span class="mono">${escapeHtml(redirectHost)}</span></p>
        <p><strong>Scope:</strong> <span class="mono">${escapeHtml(params.scope || '(default)')}</span></p>
      </div>
      <form method="post" action="${escapeHtml(actionPath)}">
        <input type="hidden" name="response_type" value="${escapeHtml(params.responseType ?? '')}" />
        <input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}" />
        <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}" />
        <input type="hidden" name="state" value="${escapeHtml(params.state)}" />
        <input type="hidden" name="scope" value="${escapeHtml(params.scope)}" />
        <input type="hidden" name="resource" value="${escapeHtml(params.resource)}" />
        <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge)}" />
        <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.codeChallengeMethod)}" />
        <input type="hidden" name="consent_token" value="${escapeHtml(consentToken)}" />
        <div class="actions">
          <button type="submit" name="decision" value="deny">Deny</button>
          <button type="submit" name="decision" value="approve">Authorize</button>
        </div>
      </form>
    </main>
  </body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    },
  });
}

function buildErrorRedirect(
  params: Pick<ReturnType<typeof getAuthorizeParams>, 'redirectUri' | 'state'>,
  code: string,
) {
  const redirect = new URL(params.redirectUri);
  redirect.searchParams.set('error', code);
  if (params.state) redirect.searchParams.set('state', params.state);
  return NextResponse.redirect(redirect);
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

  const consentToken = await issueAuthorizeConsentToken({
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: 'S256',
    state: params.state,
    scope: params.scope,
    resource: params.resource || expectedResource,
    userId: user.id,
  });

  return renderConsentPage(request, params, consentToken);
}

export async function POST(request: Request) {
  const origin = resolveRequestOrigin(request);
  const expectedResource = buildMcpResourceUrl(origin, MCP_DEFAULT_RESOURCE_PATH);
  const form = await request.formData();
  const params = getAuthorizeParamsFromForm(form);
  const validationError = await validateAuthorizeParams(params, expectedResource);
  if (validationError) return validationError;

  const decision = String(form.get('decision') ?? 'deny');
  if (decision !== 'approve') {
    return buildErrorRedirect(params, 'access_denied');
  }

  const consentToken = String(form.get('consent_token') ?? '');
  if (!consentToken) {
    return NextResponse.json({ error: 'access_denied', error_description: 'Missing consent token' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('next', buildAuthorizeUrl(new URL(request.url), params).toString());
    return NextResponse.redirect(loginUrl);
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.refresh_token) {
    return NextResponse.json({ error: 'access_denied', error_description: 'No active refresh token' }, { status: 401 });
  }

  const consentValid = await verifyAuthorizeConsentToken(consentToken, {
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: 'S256',
    state: params.state,
    scope: params.scope,
    resource: params.resource || expectedResource,
    userId: user.id,
  });
  if (!consentValid) {
    return NextResponse.json(
      { error: 'access_denied', error_description: 'Consent validation failed' },
      { status: 400 },
    );
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
