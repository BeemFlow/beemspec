import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';

export function createClient() {
  const supabaseUrl = env.supabaseUrl();
  const supabaseKey = env.supabaseAnonKey();

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createBrowserClient(supabaseUrl, supabaseKey);
}
