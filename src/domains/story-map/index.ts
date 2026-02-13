import type { AuthDomainPort } from '@/domains/auth';
import { authDomainPort } from '@/domains/auth';
import type { LinearIssueSyncPort, LinearWebhookIngestPort } from '@/integrations/linear/contracts';
import type { OpenCodePluginPort } from '@/integrations/opencode/contracts';
import type { ReleaseRunnerPort } from '@/orchestration/release-runner/contracts';

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
    linearIssueSync: null,
    linearWebhookIngest: null,
    openCode: null,
    releaseRunner: null,
    ...overrides,
  };
}
