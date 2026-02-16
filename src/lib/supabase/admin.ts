import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Creates a Supabase client with elevated privileges for admin operations.
 * Use this for operations that require admin access like inviteUserByEmail.
 * NEVER expose this client or the secret key to the browser.
 *
 * Uses SUPABASE_SECRET_KEY.
 */
export function createAdminClient() {
  const supabaseUrl = env.supabaseUrl();
  const secretKey = env.supabaseSecretKey();

  if (!supabaseUrl || !secretKey) {
    throw new Error('Missing Supabase admin environment variable SUPABASE_SECRET_KEY');
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
