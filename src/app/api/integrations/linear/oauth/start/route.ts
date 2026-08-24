import { NextResponse } from 'next/server';
import { OAUTH_STATE_COOKIE, serializeStateCookie } from '@/integrations/linear/oauth';
import { createLinearOAuthAuthorizeUrl } from '@/integrations/linear/oauth-token';
import { requireAuth } from '@/lib/auth';
import { resolveRequestOrigin, resolveSafeRedirectPath } from '@/lib/request-url';
import { isTeamOwnerForRequest } from '@/lib/teams';
import { isValidUuid } from '@/lib/validations';

function resolveReturnTo(request: Request): string {
  const value = new URL(request.url).searchParams.get('return_to');
  return resolveSafeRedirectPath(value);
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const teamId = new URL(request.url).searchParams.get('team_id');
  if (!teamId || !isValidUuid(teamId)) {
    return NextResponse.json({ error: 'Valid team_id is required' }, { status: 400 });
  }

  if (!(await isTeamOwnerForRequest(auth.supabase, auth.user.id, teamId))) {
    return NextResponse.json({ error: 'Only team owners can connect Linear' }, { status: 403 });
  }

  const state = crypto.randomUUID();
  const returnTo = resolveReturnTo(request);
  const isSecure = new URL(resolveRequestOrigin(request)).protocol === 'https:';
  let authorizeUrl: string;

  try {
    authorizeUrl = createLinearOAuthAuthorizeUrl({ state });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Linear OAuth is not configured' },
      { status: 500 },
    );
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: serializeStateCookie({ state, teamId, userId: auth.user.id, returnTo }),
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecure,
    path: '/',
    maxAge: 10 * 60,
  });

  return response;
}
