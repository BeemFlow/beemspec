import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client with elevated privileges for admin operations.
 * Use this for operations that require admin access like inviteUserByEmail.
 * NEVER expose this client or the secret key to the browser.
 *
 * Supports both new (sb_secret_...) and legacy (service_role) key formats.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Prefer new secret key format, fall back to legacy service_role key
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error('Missing Supabase admin environment variables (SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY)');
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
