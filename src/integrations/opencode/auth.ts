import { env } from '@/lib/env';

export function isAuthorizedByOpenCodeToken(request: Request): boolean {
  const token = env.openCodeToken();
  if (!token) return false;

  const authHeader = request.headers.get('authorization') ?? '';
  return authHeader === `Bearer ${token}`;
}
