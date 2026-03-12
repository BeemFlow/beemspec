export type {
  Activity,
  ActivityWithTasks,
  Release,
  Story,
  StoryContent,
  StoryMap,
  StoryMapFull,
  StoryStatus,
  Task,
  TaskWithStories,
} from '@beemspec/storymap';

export type TeamRole = 'owner' | 'member';

export interface Team {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

/** Shape returned by get_team_members RPC (includes email from auth.users) */
export interface TeamMember {
  id: string;
  user_id: string;
  role: TeamRole;
  email: string;
  created_at: string;
}

export interface TeamWithRole extends Team {
  role: TeamRole;
}

export interface TeamInvite {
  id: string;
  team_id: string;
  email: string;
  invited_by: string;
  created_at: string;
  accepted_at: string | null;
}

export interface Persona {
  id: string;
  story_map_id: string;
  name: string;
  description: string | null;
  goals: string | null;
  created_at: string;
}

// Joined types with timestamps for DB rows
export interface ReleaseWithStories extends Release {
  stories: Story[];
}

// Import for local use in ReleaseWithStories
import type { Release, Story } from '@beemspec/storymap';
