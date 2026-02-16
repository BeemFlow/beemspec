import { LinearClient } from '@linear/sdk';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { exchangeLinearOAuthCode, upsertLinearOAuthConnection } from '@/integrations/linear/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { runtime } from '@/runtime';

const OAUTH_STATE_COOKIE = 'beemspec_linear_oauth_state';

interface OAuthStateCookie {
  state: string;
  teamId: string;
  userId: string;
  returnTo: string;
}

async function isTeamOwnerForRequest(userId: string, teamId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .maybeSingle<{ role: string }>();

  if (error || !data) return false;
  return data.role === 'owner';
}

function parseCookie(value: string | undefined): OAuthStateCookie | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<OAuthStateCookie>;
    if (!parsed.state || !parsed.teamId || !parsed.userId) return null;
    return {
      state: parsed.state,
      teamId: parsed.teamId,
      userId: parsed.userId,
      returnTo: parsed.returnTo?.startsWith('/') ? parsed.returnTo : '/',
    };
  } catch {
    return null;
  }
}

function tokenExpiresAt(expiresIn: number | null): string | null {
  if (!expiresIn || expiresIn <= 0) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

function redirectWithState(request: Request, returnTo: string, status: 'success' | 'error', reason?: string) {
  const base = new URL(returnTo, request.url);
  if (status === 'success') {
    base.searchParams.set('linear_oauth', 'success');
  } else {
    base.searchParams.set('linear_oauth', 'error');
    if (reason) base.searchParams.set('reason', reason);
  }

  const response = NextResponse.redirect(base);
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: Request) {
  const auth = await runtime.storyMap.auth.requireAuth();
  if (!auth.success) return auth.response;

  const url = new URL(request.url);
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  const oauthError = url.searchParams.get('error') ?? '';
  const cookieStore = await cookies();
  const cookie = parseCookie(cookieStore.get(OAUTH_STATE_COOKIE)?.value);

  if (!cookie) {
    return redirectWithState(request, '/', 'error', 'missing_state');
  }

  if (cookie.userId !== auth.user.id || cookie.state !== state) {
    return redirectWithState(request, cookie.returnTo, 'error', 'invalid_state');
  }

  if (!(await isTeamOwnerForRequest(auth.user.id, cookie.teamId))) {
    return redirectWithState(request, cookie.returnTo, 'error', 'not_owner');
  }

  if (!code || oauthError) {
    return redirectWithState(request, cookie.returnTo, 'error', 'authorization_denied');
  }

  try {
    const token = await exchangeLinearOAuthCode(code);
    const linearClient = new LinearClient({ accessToken: token.accessToken });
    const viewer = await linearClient.viewer;
    const organization = await viewer.organization;

    await upsertLinearOAuthConnection({
      teamId: cookie.teamId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenType: token.tokenType,
      scope: token.scope,
      expiresAt: tokenExpiresAt(token.expiresIn),
      userId: auth.user.id,
    });

    const admin = createAdminClient();
    await admin.from('integration_settings').upsert(
      {
        team_id: cookie.teamId,
        linear_workspace_id: organization?.id ?? undefined,
      },
      { onConflict: 'team_id' },
    );

    return redirectWithState(request, cookie.returnTo, 'success');
  } catch {
    return redirectWithState(request, cookie.returnTo, 'error', 'token_exchange_failed');
  }
}
