import type { Plugin } from '@opencode-ai/plugin';
import { compactedContextForStories } from './plugin';
import type { SessionContextResponse } from './types';

function getApiUrl(): string | null {
  const value = process.env.BEEMSPEC_API_URL ?? process.env.BEEMSPEC_OPENCODE_BASE_URL;
  return value?.trim() || null;
}

function getApiToken(): string | null {
  const value = process.env.BEEMSPEC_OPENCODE_TOKEN;
  return value?.trim() || null;
}

async function fetchSessionContext(sessionId: string): Promise<SessionContextResponse | null> {
  const apiUrl = getApiUrl();
  if (!apiUrl) return null;

  const token = getApiToken();
  const headers: Record<string, string> = { accept: 'application/json' };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(
      `${apiUrl.replace(/\/$/, '')}/api/opencode/sessions/${encodeURIComponent(sessionId)}/context`,
      { method: 'GET', headers },
    );
    if (!response.ok) return null;
    return (await response.json()) as SessionContextResponse;
  } catch {
    return null;
  }
}

export const BeemSpecPlugin: Plugin = async () => {
  return {
    'experimental.session.compacting': async (input, output) => {
      const context = await fetchSessionContext(input.sessionID);
      if (!context || context.stories.length === 0) return;
      output.context.push(...compactedContextForStories(context.stories));
    },
  };
};

export default BeemSpecPlugin;
