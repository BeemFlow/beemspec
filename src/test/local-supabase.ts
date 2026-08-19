import { createClient } from '@supabase/supabase-js';

function requiredEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'SUPABASE_SECRET_KEY') {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Set local Supabase env vars before running integration tests.`);
  }
  return value;
}

function requireLocalSupabaseUrl(): string {
  const value = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const hostname = new URL(value).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
    throw new Error(`Integration tests refuse to use non-local Supabase URL: ${hostname}`);
  }
  return value;
}

export function createLocalSupabaseAdminClient() {
  return createClient(requireLocalSupabaseUrl(), requiredEnv('SUPABASE_SECRET_KEY'), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
