import { createClient } from '@supabase/supabase-js';

function requiredEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'SUPABASE_SECRET_KEY') {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Set local Supabase env vars before running integration tests.`);
  }
  return value;
}

export function createLocalSupabaseAdminClient() {
  return createClient(requiredEnv('NEXT_PUBLIC_SUPABASE_URL'), requiredEnv('SUPABASE_SECRET_KEY'), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
