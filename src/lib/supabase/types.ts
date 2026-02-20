import type { createClient } from './server';

/**
 * Full Supabase server client type.
 * Use this when you need the complete Supabase client API (e.g. in route
 * handlers or build-run orchestration).
 */
export type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Minimal structural type for Supabase dependency injection.
 * Use this in library/integration code that only needs `from()` table access,
 * so the function can be tested without a real Supabase client.
 */
export type SupabaseLike = {
  from: (table: string) => unknown;
};
