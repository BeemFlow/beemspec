import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getLinearViewerInfo } from '@/integrations/linear/adapter';
import { toExpiresAt, upsertLinearOAuthConnection } from '@/integrations/linear/connections';
import { applySuggestedLinearSettings, resolveLinearOptions } from '@/integrations/linear/discovery';
import { OAUTH_STATE_COOKIE, parseStateCookie } from '@/integrations/linear/oauth';
import { exchangeLinearOAuthCode } from '@/integrations/linear/oauth-token';
import { requireAuth } from '@/lib/auth';
import { resolveRequestOrigin } from '@/lib/request-url';
import { createAdminClient } from '@/lib/supabase/admin';
import { isTeamOwnerForRequest } from '@/lib/teams';

function redirectWithState(request: Request, returnTo: string, status: 'success' | 'error', reason?: string) {
  const base = new URL(returnTo, resolveRequestOrigin(request));
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
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const url = new URL(request.url);
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  const oauthError = url.searchParams.get('error') ?? '';
  const cookieStore = await cookies();
  const cookie = parseStateCookie(cookieStore.get(OAUTH_STATE_COOKIE)?.value);

  if (!cookie) {
    return redirectWithState(request, '/', 'error', 'missing_state');
  }

  if (cookie.userId !== auth.user.id || cookie.state !== state) {
    return redirectWithState(request, cookie.returnTo, 'error', 'invalid_state');
  }

  if (!(await isTeamOwnerForRequest(auth.supabase, auth.user.id, cookie.teamId))) {
    return redirectWithState(request, cookie.returnTo, 'error', 'not_owner');
  }

  if (!code || oauthError) {
    return redirectWithState(request, cookie.returnTo, 'error', 'authorization_denied');
  }

  try {
    const token = await exchangeLinearOAuthCode(code);
    const viewerInfo = await getLinearViewerInfo(token.accessToken);

    const admin = createAdminClient();

    await upsertLinearOAuthConnection(admin, {
      teamId: cookie.teamId,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenType: token.tokenType,
      scope: token.scope,
      expiresAt: toExpiresAt(token.expiresIn),
      userId: auth.user.id,
    });

    const { data: current } = await admin
      .from('integration_settings')
      .select('linear_workspace_id, linear_team_id, linear_status_mapping')
      .eq('team_id', cookie.teamId)
      .maybeSingle();

    const workspaceOptions = await resolveLinearOptions(token.accessToken).catch(() => null);
    const suggested = workspaceOptions
      ? applySuggestedLinearSettings(
          {
            linearWorkspaceId: current?.linear_workspace_id ?? viewerInfo.organizationId ?? null,
            linearTeamId: current?.linear_team_id ?? null,
            linearStatusMapping: current?.linear_status_mapping ?? {},
          },
          workspaceOptions,
        )
      : null;

    await admin.from('integration_settings').upsert(
      {
        team_id: cookie.teamId,
        linear_workspace_id:
          suggested?.linearWorkspaceId ?? current?.linear_workspace_id ?? viewerInfo.organizationId ?? null,
        linear_team_id: suggested?.linearTeamId ?? current?.linear_team_id ?? null,
        linear_status_mapping: suggested?.linearStatusMapping ?? current?.linear_status_mapping ?? {},
      },
      { onConflict: 'team_id' },
    );

    return redirectWithState(request, cookie.returnTo, 'success');
  } catch {
    return redirectWithState(request, cookie.returnTo, 'error', 'token_exchange_failed');
  }
}
