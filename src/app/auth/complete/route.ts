import { type NextRequest, NextResponse } from 'next/server';
import { OAUTH_LOGIN_RESUME_COOKIE, parseOAuthLoginResumePath } from '@/lib/oauth-login-resume';
import { resolveRequestUrl, resolveSafeRedirectPath } from '@/lib/request-url';

export function GET(request: NextRequest) {
  const explicitNext = resolveSafeRedirectPath(request.nextUrl.searchParams.get('next'), '');
  const resumePath = parseOAuthLoginResumePath(request.cookies.get(OAUTH_LOGIN_RESUME_COOKIE)?.value);
  const redirectTarget = explicitNext || resumePath || '/';
  const response = NextResponse.redirect(resolveRequestUrl(request, redirectTarget));

  response.cookies.set(OAUTH_LOGIN_RESUME_COOKIE, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
  });

  return response;
}
