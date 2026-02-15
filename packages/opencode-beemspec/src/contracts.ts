export interface OpenCodeSessionContext {
  releaseId: string;
  storyId: string;
  storyTitle: string;
  requirements: string;
  acceptanceCriteria: string;
  technicalGuidelines: string | null;
}

export interface OpenCodeCompactionInput {
  sessionId: string;
  context: OpenCodeSessionContext;
}

export interface OpenCodeCompactionOutput {
  context: string[];
  prompt?: string;
}

export interface OpenCodeSystemPromptTransformInput {
  sessionId: string;
  system: string[];
  context: OpenCodeSessionContext;
}

export interface OpenCodeSystemPromptTransformOutput {
  system: string[];
}

export interface OpenCodeLifecycleEvent {
  type: 'session.created' | 'session.updated' | 'session.idle' | 'session.error';
  sessionId: string;
  payload: unknown;
}

export interface OpenCodePluginPort {
  onCompacting(input: OpenCodeCompactionInput): Promise<OpenCodeCompactionOutput>;
  onSystemTransform(input: OpenCodeSystemPromptTransformInput): Promise<OpenCodeSystemPromptTransformOutput>;
  onEvent(event: OpenCodeLifecycleEvent): Promise<void>;
}

export interface OpenCodeSessionCreateInput {
  releaseId: string;
  storyId: string;
  storyTitle: string;
  linearIssueId: string;
  linearIssueIdentifier: string;
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

export interface OpenCodeSessionPort {
  createSession(input: OpenCodeSessionCreateInput): Promise<OpenCodeSessionSnapshot>;
  getSessionById(sessionId: string): Promise<OpenCodeSessionSnapshot | null>;
}

export interface BeemSpecStoryToolInput {
  storyId: string;
}

export interface BeemSpecBlockedToolInput {
  storyId: string;
  reason: string;
}
