export type LinearIssueId = string;
export type LinearTeamId = string;
export type LinearProjectId = string;
export type LinearStateId = string;

export interface LinearIssueSnapshot {
  id: LinearIssueId;
  identifier: string;
  title: string;
  description: string | null;
  stateId: LinearStateId | null;
  updatedAt: string;
}

export interface LinearIssueUpsertInput {
  title: string;
  description: string;
  teamId: LinearTeamId;
  projectId?: LinearProjectId;
  stateId?: LinearStateId;
}

export interface LinearIssueSync {
  getIssueById(issueId: LinearIssueId): Promise<LinearIssueSnapshot | null>;
  createIssue(input: LinearIssueUpsertInput): Promise<LinearIssueSnapshot>;
  updateIssue(issueId: LinearIssueId, input: Partial<LinearIssueUpsertInput>): Promise<LinearIssueSnapshot>;
}

export interface LinearWebhookEvent {
  idempotencyKey: string;
  type: string;
  action: string;
  createdAt: string;
  payload: unknown;
}

export interface LinearWebhookSignatureVerifier {
  verify(input: { rawBody: string; signature: string; timestamp: string }): boolean;
}

export interface LinearWebhookIngest {
  parseAndValidate(input: { rawBody: string; headers: Headers }): LinearWebhookEvent;
}
