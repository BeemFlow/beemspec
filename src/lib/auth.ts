import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export type AuthResult =
  | { success: true; user: { id: string; email: string } }
  | { success: false; response: NextResponse };

/** Verify authentication in API routes (server-only) */
export async function requireAuth(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { success: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { success: true, user: { id: user.id, email: user.email ?? '' } };
}
