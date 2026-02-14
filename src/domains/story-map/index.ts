import type { AuthDomainPort } from '@/domains/auth';
import { authDomainPort } from '@/domains/auth';
import { integrationFlags } from '@/integrations/flags';
import type { LinearIssueSyncPort, LinearWebhookIngestPort } from '@/integrations/linear/contracts';
import { createLinearIssueSyncPort } from '@/integrations/linear/issue-sync';
import { createLinearWebhookIngestStub } from '@/integrations/linear/stub';
import type { OpenCodePluginPort } from '@/integrations/opencode/contracts';
import { createOpenCodePluginStub } from '@/integrations/opencode/stub';
import type { ReleaseRunnerPort } from '@/orchestration/release-runner/contracts';
import { createReleaseRunnerStub } from '@/orchestration/release-runner/stub';

export interface StoryMapDomainPorts {
  auth: AuthDomainPort;
  linearIssueSync: LinearIssueSyncPort | null;
  linearWebhookIngest: LinearWebhookIngestPort | null;
  openCode: OpenCodePluginPort | null;
  releaseRunner: ReleaseRunnerPort | null;
}

export function createStoryMapDomainPorts(overrides: Partial<StoryMapDomainPorts> = {}): StoryMapDomainPorts {
  return {
    auth: authDomainPort,
    linearIssueSync: createLinearIssueSyncPort(integrationFlags.linear),
    linearWebhookIngest: createLinearWebhookIngestStub(integrationFlags.linear),
    openCode: createOpenCodePluginStub(integrationFlags.opencode),
    releaseRunner: createReleaseRunnerStub(integrationFlags.releaseRunner),
    ...overrides,
  };
}
