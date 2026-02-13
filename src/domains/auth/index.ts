import type { AuthResult } from '@/lib/auth';
import { requireAuth } from '@/lib/auth';

export interface AuthDomainPort {
  requireAuth(): Promise<AuthResult>;
}

export const authDomainPort: AuthDomainPort = {
  requireAuth,
};
