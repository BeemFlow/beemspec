import { integrationFlags } from '@/integrations/flags';
import { createLinearIssueSync } from '@/integrations/linear/issue-sync';
import type { LinearIssueSync, LinearWebhookIngest } from '@/integrations/linear/types';
import { createLinearWebhookIngest } from '@/integrations/linear/webhook-ingest';
import { createOpenCodeSessions } from '@/integrations/opencode/session';
import type { OpenCodeSessions } from '@/integrations/opencode/types';
import type { AuthResult } from '@/lib/auth';
import { requireAuth } from '@/lib/auth';

export interface AuthPort {
  requireAuth(): Promise<AuthResult>;
}

const authPort: AuthPort = {
  requireAuth,
};

export interface StoryMapRuntimeDeps {
  auth: AuthPort;
  linearIssueSync: LinearIssueSync | null;
  linearWebhookIngest: LinearWebhookIngest | null;
  openCodeSessions: OpenCodeSessions | null;
}

export interface TeamsRuntimeDeps {
  auth: AuthPort;
  linearIssueSync: LinearIssueSync | null;
}

function createStoryMapRuntimeDeps(overrides: Partial<StoryMapRuntimeDeps> = {}): StoryMapRuntimeDeps {
  return {
    auth: authPort,
    linearIssueSync: createLinearIssueSync(integrationFlags.linear),
    linearWebhookIngest: createLinearWebhookIngest(integrationFlags.linear),
    openCodeSessions: createOpenCodeSessions(integrationFlags.opencode),
    ...overrides,
  };
}

function createTeamsRuntimeDeps(overrides: Partial<TeamsRuntimeDeps> = {}): TeamsRuntimeDeps {
  return {
    auth: authPort,
    linearIssueSync: createLinearIssueSync(integrationFlags.linear),
    ...overrides,
  };
}

export const runtime = {
  storyMap: createStoryMapRuntimeDeps(),
  teams: createTeamsRuntimeDeps(),
};
