export interface OpenCodeSessionContext {
  releaseId: string;
  storyId: string;
  storyTitle: string;
  requirements: string;
  acceptanceCriteria: string;
  technicalGuidelines: string | null;
}

export interface OpenCodeSessionCreateInput {
  releaseId?: string;
  runId?: string;
  storyId?: string;
  storyTitle?: string;
  linearIssueId?: string;
  linearIssueIdentifier?: string;
  workingDirectory?: string;
  requirements?: string;
  acceptanceCriteria?: string;
  technicalGuidelines: string | null;
  stories?: Array<{
    storyId: string;
    storyTitle: string;
    linearIssueIdentifier?: string | null;
  }>;
}

export interface OpenCodeSessionStoryAssignmentInput {
  sessionId: string;
  runId: string;
  storyId: string;
  storyTitle: string;
  linearIssueIdentifier: string | null;
  workingDirectory?: string | null;
  requirements: string;
  acceptanceCriteria: string;
  technicalGuidelines: string | null;
}

export interface OpenCodeSessionSnapshot {
  id: string;
  url: string;
  state: 'active' | 'completed' | 'failed';
  createdAt: string;
}

export interface OpenCodeSessionService {
  createSession(input: OpenCodeSessionCreateInput): Promise<OpenCodeSessionSnapshot>;
  getSessionById(sessionId: string): Promise<OpenCodeSessionSnapshot | null>;
  appendStoryAssignment(input: OpenCodeSessionStoryAssignmentInput): Promise<void>;
  startSession(sessionId: string, storyCount: number, workingDirectory?: string | null): Promise<void>;
}

export interface SessionContextResponse {
  sessionId: string;
  releaseId: string | null;
  runId: string | null;
  stories: OpenCodeSessionContext[];
}
