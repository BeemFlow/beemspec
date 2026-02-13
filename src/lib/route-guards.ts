import type { NextResponse } from 'next/server';
import type { AuthenticatedUser } from '@/lib/auth';
import { requireAuth } from '@/lib/auth';
import { invalidIdResponse, isValidUuid } from '@/lib/validations';

type GuardFailure = { success: false; response: NextResponse };
type GuardSuccess<T extends Record<string, string>> = {
  success: true;
  user: AuthenticatedUser;
  params: T;
};

type GuardResult<T extends Record<string, string>> = GuardFailure | GuardSuccess<T>;

export async function requireAuthWithUuidParams<T extends Record<string, string>>(
  paramsPromise: Promise<T>,
  uuidKeys: (keyof T)[],
): Promise<GuardResult<T>> {
  const auth = await requireAuth();
  if (!auth.success) {
    return auth;
  }

  const params = await paramsPromise;
  for (const key of uuidKeys) {
    if (!isValidUuid(params[key])) {
      return { success: false, response: invalidIdResponse() };
    }
  }

  return {
    success: true,
    user: auth.user,
    params,
  };
}
