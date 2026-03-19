import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { setOAuthLoginResumeCookie } from '@/lib/oauth-login-resume';
import { resolveRequestUrl, resolveSafeRedirectPath } from '@/lib/request-url';

const GUEST_ONLY_AUTH_ROUTES = new Set(['/auth/login', '/auth/signup']);

export async function proxy(request: NextRequest) {
  if (env.e2eTestMode()) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = env.supabaseUrl();
  const supabaseKey = env.supabasePublishableKey();

  if (!supabaseUrl || !supabaseKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh session - use getUser() for server-side validation
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith('/auth');
  const isGuestOnlyAuthRoute = GUEST_ONLY_AUTH_ROUTES.has(pathname);
  const isApiRoute = pathname.startsWith('/api');
  const isWellKnownRoute = pathname.startsWith('/.well-known/');

  const nextTarget = request.nextUrl.searchParams.get('next');
  const safeNextPath = nextTarget ? resolveSafeRedirectPath(nextTarget, '') : '';

  // Don't redirect API or well-known OAuth metadata routes
  if (isApiRoute || isWellKnownRoute) {
    return supabaseResponse;
  }

  // Redirect unauthenticated users to login (except auth routes)
  if (!user && !isAuthRoute) {
    const url = resolveRequestUrl(request, '/auth/login');

    if (pathname === '/oauth/consent') {
      const response = NextResponse.redirect(url);
      setOAuthLoginResumeCookie(
        response.cookies,
        `${pathname}${request.nextUrl.search}`,
        request.nextUrl.protocol === 'https:',
      );

      return response;
    }

    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from guest-only auth pages
  if (user && isGuestOnlyAuthRoute) {
    if (safeNextPath) {
      return NextResponse.redirect(resolveRequestUrl(request, safeNextPath));
    }

    return NextResponse.redirect(resolveRequestUrl(request, '/'));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
