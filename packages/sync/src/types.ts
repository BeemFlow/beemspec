import type { StoryContent, StoryStatus } from '@beemspec/storymap';

export interface IssueSnapshot {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  stateId: string | null;
  stateName?: string | null;
  updatedAt: string;
}

export interface IssueUpsertInput {
  id?: string;
  title: string;
  description: string;
  teamId: string;
  projectId?: string;
  stateId?: string;
}

export interface IssueSync {
  getIssueById(issueId: string): Promise<IssueSnapshot | null>;
  createIssue(input: IssueUpsertInput): Promise<IssueSnapshot>;
  updateIssue(issueId: string, input: Partial<IssueUpsertInput>): Promise<IssueSnapshot>;
  deleteIssue(issueId: string): Promise<void>;
}

export interface SyncTarget {
  teamId: string;
  projectId?: string;
  statusMapping?: Partial<Record<StoryStatus, string>>;
}

export const SYNC_DIRECTION = {
  remoteToLocal: 'remote_to_local',
  localToRemote: 'local_to_remote',
} as const;

export type SyncDirection = (typeof SYNC_DIRECTION)[keyof typeof SYNC_DIRECTION];

export type { StoryStatus };

export interface StoryForSync {
  id: string;
  title: string;
  content: StoryContent;
  status: string;
}

export interface StoryPatchFromRemote {
  title?: string;
  content?: Partial<StoryContent>;
  status?: StoryStatus;
  updated_at: string;
}

export interface WebhookEvent {
  idempotencyKey: string;
  type: string;
  action: string;
  occurredAt: string;
  deliveredAt: string;
  payload: unknown;
}

export interface WebhookSignatureVerifier {
  verify(input: { rawBody: string; signature: string; timestamp: string }): boolean;
}

export interface WebhookIngest {
  parseAndValidate(input: { rawBody: string; headers: Headers }): WebhookEvent;
}
