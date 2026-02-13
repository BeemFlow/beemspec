import type {
  OpenCodeCompactionInput,
  OpenCodeCompactionOutput,
  OpenCodeLifecycleEvent,
  OpenCodePluginPort,
  OpenCodeSystemPromptTransformInput,
  OpenCodeSystemPromptTransformOutput,
} from '@/integrations/opencode/contracts';

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
