import { NextResponse } from 'next/server';
import { resolveRequestOrigin, resolveSafeRedirectPath } from '@/lib/request-url';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = resolveRequestOrigin(request);
  const code = searchParams.get('code');
  const next = resolveSafeRedirectPath(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Return to login with error
  return NextResponse.redirect(new URL('/auth/login?error=auth_callback_error', origin));
}
