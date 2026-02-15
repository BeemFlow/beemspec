import { integrationFlags } from '@/integrations/flags';
import { createLinearIssueSync } from '@/integrations/linear/issue-sync';
import type { LinearIssueSync, LinearWebhookIngest } from '@/integrations/linear/types';
import { createLinearWebhookIngest } from '@/integrations/linear/webhook-ingest';
import { createOpenCodeSessions } from '@/integrations/opencode/session';
import type { OpenCodeSessions } from '@/integrations/opencode/types';
import { type AuthPort, authPort } from '@/runtime/auth';

export interface StoryMapRuntimeDeps {
  auth: AuthPort;
  linearIssueSync: LinearIssueSync | null;
  linearWebhookIngest: LinearWebhookIngest | null;
  openCodeSessions: OpenCodeSessions | null;
}

export function createStoryMapRuntimeDeps(overrides: Partial<StoryMapRuntimeDeps> = {}): StoryMapRuntimeDeps {
  return {
    auth: authPort,
    linearIssueSync: createLinearIssueSync(integrationFlags.linear),
    linearWebhookIngest: createLinearWebhookIngest(integrationFlags.linear),
    openCodeSessions: createOpenCodeSessions(integrationFlags.opencode),
    ...overrides,
  };
}
