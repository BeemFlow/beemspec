// @beemspec/opencode -- OpenCode session management, prompt building, and plugin hooks.

// Client (SDK wrapper with injected config)
export type { OpenCodeClient, OpenCodeClientConfig } from './client';
export { buildAuthorizationHeader, buildSessionUrl, createOpenCodeClient } from './client';
// Mappers (pure data transformations)
export type { StoryContextRow } from './mappers';
export { mapStoryToSessionContext } from './mappers';
// Session compaction (plugin hook helper)
export { compactedContextForStories } from './plugin';
// Prompt builders (pure formatting)
export {
  buildSessionContextPrompt,
  buildSessionTitle,
  buildStartSessionPrompt,
  buildStoryAssignmentPrompt,
  workingDirectoryBlock,
} from './prompts';

// Session service (headless implementation)
export { createOpenCodeSessionService } from './session';

// Types
export type {
  OpenCodeSessionContext,
  OpenCodeSessionCreateInput,
  OpenCodeSessionService,
  OpenCodeSessionSnapshot,
  OpenCodeSessionStoryAssignmentInput,
  SessionContextResponse,
} from './types';
