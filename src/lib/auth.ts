import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { Supabase } from '@/lib/supabase/types';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export type AuthResult =
  | { success: true; user: AuthenticatedUser; supabase: Supabase }
  | { success: false; response: NextResponse };

/** Verify and read the current user from locally verifiable JWT claims. */
export async function getAuthenticatedUser(supabase: Supabase): Promise<AuthenticatedUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;

  if (error || typeof userId !== 'string' || !userId) return null;

  return {
    id: userId,
    email: typeof data.claims.email === 'string' ? data.claims.email : '',
  };
}

/** Verify authentication in API routes (server-only) */
export async function requireAuth(): Promise<AuthResult> {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) {
    return { success: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  return { success: true, user, supabase };
}
