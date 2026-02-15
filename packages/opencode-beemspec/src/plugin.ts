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
  onLifecycleEvent?(event: OpenCodeLifecycleEvent): Promise<void>;
}

export interface BeemSpecToolsConfig {
  loadStoryById(input: BeemSpecStoryToolInput): Promise<OpenCodeSessionContext>;
  markStoryBlocked(input: BeemSpecBlockedToolInput): Promise<void>;
}

export interface BeemSpecNetworkToolsConfig {
  baseUrl: string;
  token?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

async function requestJson<T>(url: string, init: RequestInit, token?: string): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : 'BeemSpec request failed';
    throw new Error(message);
  }

  return payload as T;
}

function compactedContext(context: OpenCodeSessionContext): string[] {
  return [
    `Release ID: ${context.releaseId}`,
    `Story ID: ${context.storyId}`,
    `Story Title: ${context.storyTitle}`,
    `Acceptance Criteria: ${context.acceptanceCriteria}`,
  ];
}

export function createBeemSpecPlugin(config: BeemSpecPluginConfig = {}): OpenCodePluginPort {
  return {
    async onCompacting(input: OpenCodeCompactionInput): Promise<OpenCodeCompactionOutput> {
      return { context: compactedContext(input.context) };
    },
    async onSystemTransform(input: OpenCodeSystemPromptTransformInput): Promise<OpenCodeSystemPromptTransformOutput> {
      return { system: input.system };
    },
    async onEvent(event: OpenCodeLifecycleEvent): Promise<void> {
      if (config.onLifecycleEvent) await config.onLifecycleEvent(event);
    },
  };
}

export function createBeemSpecTools(config: BeemSpecToolsConfig) {
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

export function createBeemSpecNetworkTools(config: BeemSpecNetworkToolsConfig): BeemSpecToolsConfig {
  const baseUrl = normalizeBaseUrl(config.baseUrl);

  return {
    async loadStoryById(input: BeemSpecStoryToolInput): Promise<OpenCodeSessionContext> {
      return requestJson<OpenCodeSessionContext>(
        `${baseUrl}/api/opencode/story/${input.storyId}`,
        { method: 'GET' },
        config.token,
      );
    },
    async markStoryBlocked(input: BeemSpecBlockedToolInput): Promise<void> {
      await requestJson<{ ok: true }>(
        `${baseUrl}/api/opencode/blocked`,
        { method: 'POST', body: JSON.stringify({ story_id: input.storyId, reason: input.reason }) },
        config.token,
      );
    },
  };
}

export { compactedContext };
