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
