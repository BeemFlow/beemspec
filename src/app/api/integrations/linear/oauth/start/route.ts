import { NextResponse } from 'next/server';
import { createLinearOAuthAuthorizeUrl } from '@/integrations/linear/auth';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isValidUuid } from '@/lib/validations';

const OAUTH_STATE_COOKIE = 'beemspec_linear_oauth_state';

interface OAuthStateCookie {
  state: string;
  teamId: string;
  userId: string;
  returnTo: string;
}

function serializeStateCookie(payload: OAuthStateCookie): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
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

function resolveReturnTo(request: Request): string {
  const value = new URL(request.url).searchParams.get('return_to');
  if (!value || !value.startsWith('/')) return '/';
  return value;
}

export async function GET(request: Request) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  const teamId = new URL(request.url).searchParams.get('team_id');
  if (!teamId || !isValidUuid(teamId)) {
    return NextResponse.json({ error: 'Valid team_id is required' }, { status: 400 });
  }

  if (!(await isTeamOwnerForRequest(auth.user.id, teamId))) {
    return NextResponse.json({ error: 'Only team owners can connect Linear' }, { status: 403 });
  }

  const state = crypto.randomUUID();
  const returnTo = resolveReturnTo(request);
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
    secure: new URL(request.url).protocol === 'https:',
    path: '/',
    maxAge: 10 * 60,
  });

  return response;
}
