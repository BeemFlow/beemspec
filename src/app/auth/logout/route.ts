import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function handleLogout(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/auth/login', request.url));
}

export { handleLogout as GET, handleLogout as POST };
