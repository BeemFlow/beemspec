/** Cookie name used to persist OAuth state during the Linear OAuth flow. */
export const OAUTH_STATE_COOKIE = 'beemspec_linear_oauth_state';

/** Shape of the OAuth state cookie payload. */
export interface OAuthStateCookie {
  state: string;
  teamId: string;
  userId: string;
  returnTo: string;
}

/** Serialize an OAuthStateCookie to a base64url string for cookie storage. */
export function serializeStateCookie(payload: OAuthStateCookie): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/** Parse a base64url cookie value back to an OAuthStateCookie. */
export function parseStateCookie(value: string | undefined): OAuthStateCookie | null {
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
