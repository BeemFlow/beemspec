import type { AuthResult } from '@/lib/auth';
import { requireAuth } from '@/lib/auth';

export interface AuthPort {
  requireAuth(): Promise<AuthResult>;
}

export const authPort: AuthPort = {
  requireAuth,
};
