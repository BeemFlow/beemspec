import { createLinearIssueSync } from '@/integrations/linear/issue-sync';
import type { LinearIssueSync, LinearWebhookIngest } from '@/integrations/linear/types';
import { createLinearWebhookIngest } from '@/integrations/linear/webhook-ingest';
import { createOpenCodeSessions } from '@/integrations/opencode/session';
import type { OpenCodeSessions } from '@/integrations/opencode/types';
import type { AuthResult } from '@/lib/auth';
import { requireAuth } from '@/lib/auth';
import { env } from '@/lib/env';

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
  const hasLinearApiKey = Boolean(env.linearApiKey());
  const hasLinearWebhookSecret = Boolean(env.linearWebhookSecret());

  return {
    auth: authPort,
    linearIssueSync: createLinearIssueSync(hasLinearApiKey),
    linearWebhookIngest: createLinearWebhookIngest(hasLinearWebhookSecret),
    openCodeSessions: createOpenCodeSessions(true),
    ...overrides,
  };
}

function createTeamsRuntimeDeps(overrides: Partial<TeamsRuntimeDeps> = {}): TeamsRuntimeDeps {
  const hasLinearApiKey = Boolean(env.linearApiKey());

  return {
    auth: authPort,
    linearIssueSync: createLinearIssueSync(hasLinearApiKey),
    ...overrides,
  };
}

export const runtime = {
  storyMap: createStoryMapRuntimeDeps(),
  teams: createTeamsRuntimeDeps(),
};
