import { createStoryMapRuntimeDeps } from '@/runtime/story-map';
import { createTeamsRuntimeDeps } from '@/runtime/teams';

export const runtime = {
  storyMap: createStoryMapRuntimeDeps(),
  teams: createTeamsRuntimeDeps(),
};
