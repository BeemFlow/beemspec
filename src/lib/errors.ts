import { NextResponse } from 'next/server';

/**
 * Supabase/PostgreSQL error codes - centralized to avoid magic strings
 */
export const DbErrorCode = {
  /** PostgREST: No rows returned when .single() expected one */
  NOT_FOUND: 'PGRST116',
} as const;

/**
 * Return a 404 response for a missing resource
 */
export function notFoundResponse(resource: string): NextResponse {
  return NextResponse.json({ error: `${resource} not found` }, { status: 404 });
}

/**
 * Return a 500 response and log the error
 */
export function serverErrorResponse(message: string, error?: unknown): NextResponse {
  // biome-ignore lint/suspicious/noConsole: intentional server-side error logging
  if (error) console.error(message, error);
  return NextResponse.json({ error: message }, { status: 500 });
}

/**
 * Exhaustive switch helper - use in default case to ensure all cases handled
 */
export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(x)}`);
}

/**
 * Extract error message from unknown error
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'An error occurred';
}
