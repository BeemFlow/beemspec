import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';

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

  const isAuthPage = request.nextUrl.pathname.startsWith('/auth');
  const isApiRoute = request.nextUrl.pathname.startsWith('/api');
  const isWellKnownRoute = request.nextUrl.pathname.startsWith('/.well-known/');

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

  // Redirect unauthenticated users to login (except auth pages)
  if (!user && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && isAuthPage) {
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
  matcher: ['/((?!_next/static|_next/image|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
