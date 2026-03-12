import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';

const GUEST_ONLY_AUTH_ROUTES = new Set(['/auth/login', '/auth/signup']);

export async function proxy(request: NextRequest) {
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
  const safeNextUrl = (() => {
    if (!nextTarget) return null;
    try {
      const parsed = new URL(nextTarget, request.url);
      if (parsed.origin !== request.nextUrl.origin) return null;
      return parsed;
    } catch {
      return null;
    }
  })();

  // Don't redirect API or well-known OAuth metadata routes
  if (isApiRoute || isWellKnownRoute) {
    return supabaseResponse;
  }

  // Redirect unauthenticated users to login (except auth routes)
  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from guest-only auth pages
  if (user && isGuestOnlyAuthRoute) {
    if (safeNextUrl) {
      return NextResponse.redirect(safeNextUrl);
    }

    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
