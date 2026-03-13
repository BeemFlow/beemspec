import { NextResponse } from 'next/server';
import { resolveRequestUrl } from '@/lib/request-url';
import { createClient } from '@/lib/supabase/server';

async function handleLogout(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(resolveRequestUrl(request, '/auth/login'));
}

export { handleLogout as GET, handleLogout as POST };
