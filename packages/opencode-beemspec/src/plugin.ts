import type {
  BeemSpecBlockedToolInput,
  BeemSpecStoryToolInput,
  OpenCodeCompactionInput,
  OpenCodeCompactionOutput,
  OpenCodeLifecycleEvent,
  OpenCodePluginPort,
  OpenCodeSessionContext,
  OpenCodeSystemPromptTransformInput,
  OpenCodeSystemPromptTransformOutput,
} from './contracts';

export interface BeemSpecPluginConfig {
  loadStoryById(input: BeemSpecStoryToolInput): Promise<OpenCodeSessionContext>;
  markStoryBlocked(input: BeemSpecBlockedToolInput): Promise<void>;
  onLifecycleEvent?(event: OpenCodeLifecycleEvent): Promise<void>;
}

export function createBeemSpecPlugin(config: BeemSpecPluginConfig): OpenCodePluginPort {
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
      return { system: input.system };
    },
    async onEvent(event: OpenCodeLifecycleEvent): Promise<void> {
      if (!config.onLifecycleEvent) return;
      await config.onLifecycleEvent(event);
    },
  };
}

export function createBeemSpecTools(config: BeemSpecPluginConfig) {
  return {
    async beemspecStory(input: BeemSpecStoryToolInput): Promise<OpenCodeSessionContext> {
      return config.loadStoryById(input);
    },
    async beemspecBlocked(input: BeemSpecBlockedToolInput): Promise<{ ok: true }> {
      await config.markStoryBlocked(input);
      return { ok: true };
    },
  };
}
