import type {
  OpenCodeCompactionInput,
  OpenCodeCompactionOutput,
  OpenCodeLifecycleEvent,
  OpenCodePluginPort,
  OpenCodeSessionCreateInput,
  OpenCodeSessionPort,
  OpenCodeSessionSnapshot,
  OpenCodeSystemPromptTransformInput,
  OpenCodeSystemPromptTransformOutput,
} from '@/integrations/opencode/contracts';

const sessions = new Map<string, OpenCodeSessionSnapshot>();

export function createOpenCodePluginStub(enabled: boolean): OpenCodePluginPort | null {
  if (!enabled) return null;

  return {
    async onCompacting(input: OpenCodeCompactionInput): Promise<OpenCodeCompactionOutput> {
      return {
        context: [
          `Release ID: ${input.context.releaseId}`,
          `Story ID: ${input.context.storyId}`,
          `Story Title: ${input.context.storyTitle}`,
        ],
      };
    },
    async onSystemTransform(input: OpenCodeSystemPromptTransformInput): Promise<OpenCodeSystemPromptTransformOutput> {
      return {
        system: input.system,
      };
    },
    async onEvent(_event: OpenCodeLifecycleEvent): Promise<void> {},
  };
}

function mapSessionUrl(sessionId: string): string {
  return `https://opencode.ai/sessions/${sessionId}`;
}

export function createOpenCodeSessionStub(enabled: boolean): OpenCodeSessionPort | null {
  if (!enabled) return null;

  return {
    async createSession(_input: OpenCodeSessionCreateInput): Promise<OpenCodeSessionSnapshot> {
      const sessionId = crypto.randomUUID();
      const snapshot: OpenCodeSessionSnapshot = {
        id: sessionId,
        url: mapSessionUrl(sessionId),
        state: 'active',
        createdAt: new Date().toISOString(),
      };
      sessions.set(sessionId, snapshot);
      return snapshot;
    },
    async getSessionById(sessionId: string): Promise<OpenCodeSessionSnapshot | null> {
      return sessions.get(sessionId) ?? null;
    },
  };
}
