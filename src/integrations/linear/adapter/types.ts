import type { StoryContent, StoryStatus } from '@/domain/story-map';

export interface LinearIssueSnapshot {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  stateId: string | null;
  stateName?: string | null;
  updatedAt: string;
}

export interface LinearIssueUpsertInput {
  id?: string;
  title: string;
  description: string;
  teamId: string;
  projectId?: string;
  stateId?: string;
}

export interface LinearIssueGateway {
  getIssueById(issueId: string): Promise<LinearIssueSnapshot | null>;
  createIssue(input: LinearIssueUpsertInput): Promise<LinearIssueSnapshot>;
  updateIssue(issueId: string, input: Partial<LinearIssueUpsertInput>): Promise<LinearIssueSnapshot>;
  deleteIssue(issueId: string): Promise<void>;
}

export interface LinearSyncTarget {
  teamId: string;
  projectId?: string;
  statusMapping?: Partial<Record<StoryStatus, string>>;
}

export interface LinearStoryInput {
  id: string;
  title: string;
  content: StoryContent;
  status: string;
}

export interface LinearStoryPatch {
  title?: string;
  content?: Partial<StoryContent>;
  status?: StoryStatus;
  updated_at: string;
}

export interface LinearWebhookEvent {
  idempotencyKey: string;
  type: string;
  action: string;
  occurredAt: string;
  deliveredAt: string;
  payload: unknown;
}

export interface LinearWebhookSignatureVerifier {
  verify(input: { rawBody: string; signature: string; timestamp: string }): boolean;
}

export interface LinearWebhookIngest {
  parseAndValidate(input: { rawBody: string; headers: Headers }): LinearWebhookEvent;
}
