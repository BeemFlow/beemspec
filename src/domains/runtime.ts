import { createStoryMapDomainPorts } from '@/domains/story-map';
import { createTeamsDomainPorts } from '@/domains/teams';

export const domainRuntime = {
  storyMap: createStoryMapDomainPorts(),
  teams: createTeamsDomainPorts(),
};
