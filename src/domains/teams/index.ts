import type { AuthDomainPort } from '@/domains/auth';
import { authDomainPort } from '@/domains/auth';
import { integrationFlags } from '@/integrations/flags';
import type { LinearIssueSyncPort } from '@/integrations/linear/contracts';
import { createLinearIssueSyncStub } from '@/integrations/linear/stub';

export interface TeamsDomainPorts {
  auth: AuthDomainPort;
  linearIssueSync: LinearIssueSyncPort | null;
}

export function createTeamsDomainPorts(overrides: Partial<TeamsDomainPorts> = {}): TeamsDomainPorts {
  return {
    auth: authDomainPort,
    linearIssueSync: createLinearIssueSyncStub(integrationFlags.linear),
    ...overrides,
  };
}
