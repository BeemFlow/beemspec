import type { AuthDomainPort } from '@/domains/auth';
import { authDomainPort } from '@/domains/auth';
import type { LinearIssueSyncPort } from '@/integrations/linear/contracts';

export interface TeamsDomainPorts {
  auth: AuthDomainPort;
  linearIssueSync: LinearIssueSyncPort | null;
}

export function createTeamsDomainPorts(overrides: Partial<TeamsDomainPorts> = {}): TeamsDomainPorts {
  return {
    auth: authDomainPort,
    linearIssueSync: null,
    ...overrides,
  };
}
