import type { StoryContent, StoryStatus } from '@beemspec/storymap';

// ---------------------------------------------------------------------------
// Remote issue tracker contracts -- provider-agnostic
// ---------------------------------------------------------------------------

/** A snapshot of a remote issue as returned by the tracker API. */
export interface IssueSnapshot {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  stateId: string | null;
  updatedAt: string;
}

/** Fields required to create or fully update a remote issue. */
export interface IssueUpsertInput {
  title: string;
  description: string;
  teamId: string;
  projectId?: string;
  stateId?: string;
}

/** Port for interacting with a remote issue tracker (Linear, Jira, ...). */
export interface IssueSync {
  getIssueById(issueId: string): Promise<IssueSnapshot | null>;
  createIssue(input: IssueUpsertInput): Promise<IssueSnapshot>;
  updateIssue(issueId: string, input: Partial<IssueUpsertInput>): Promise<IssueSnapshot>;
  deleteIssue(issueId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Sync target & direction
// ---------------------------------------------------------------------------

/** Where a story should be synced to in the remote tracker. */
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

// ---------------------------------------------------------------------------
// Story ↔ remote patch
// ---------------------------------------------------------------------------

export type { StoryStatus };

/** A story as seen by the sync layer (minimal shape, provider-agnostic). */
export interface StoryForSync {
  id: string;
  title: string;
  content: StoryContent;
  status: string;
}

/** Patch to apply to a local story after receiving changes from a remote tracker. */
export interface StoryPatchFromRemote {
  title?: string;
  content?: Partial<StoryContent>;
  status?: StoryStatus;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Webhook contracts
// ---------------------------------------------------------------------------

/** A parsed webhook event from a remote issue tracker. */
export interface WebhookEvent {
  idempotencyKey: string;
  type: string;
  action: string;
  createdAt: string;
  payload: unknown;
}

/** Verifies the authenticity of an incoming webhook request. */
export interface WebhookSignatureVerifier {
  verify(input: { rawBody: string; signature: string; timestamp: string }): boolean;
}

/** Parses and validates an incoming webhook request. */
export interface WebhookIngest {
  parseAndValidate(input: { rawBody: string; headers: Headers }): WebhookEvent;
}
