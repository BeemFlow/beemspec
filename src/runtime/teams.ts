import { integrationFlags } from '@/integrations/flags';
import { createLinearIssueSync } from '@/integrations/linear/issue-sync';
import type { LinearIssueSync } from '@/integrations/linear/types';
import { type AuthPort, authPort } from '@/runtime/auth';

export interface TeamsRuntimeDeps {
  auth: AuthPort;
  linearIssueSync: LinearIssueSync | null;
}

export function createTeamsRuntimeDeps(overrides: Partial<TeamsRuntimeDeps> = {}): TeamsRuntimeDeps {
  return {
    auth: authPort,
    linearIssueSync: createLinearIssueSync(integrationFlags.linear),
    ...overrides,
  };
}
