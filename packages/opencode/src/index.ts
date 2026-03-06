// @beemspec/opencode -- MCP context mapping and plugin compaction hooks.

// Mappers (pure data transformations)
export type { StoryContextRow } from './mappers';
export { mapStoryToSessionContext } from './mappers';
// Session compaction (plugin hook helper)
export { compactedContextForStories } from './plugin';

// Types
export type { OpenCodeSessionContext } from './types';
