import { createBrowserClient } from '@supabase/ssr';

// NEXT_PUBLIC_ vars must be accessed directly via process.env for Next.js
// static replacement to work on the client side. Do NOT read these through
// the env helper — it breaks the inlining.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function createClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createBrowserClient(supabaseUrl, supabaseKey);
}
