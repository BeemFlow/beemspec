export type StoryStatus = 'backlog' | 'ready' | 'in_progress' | 'review' | 'done'

export interface StoryMap {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface Persona {
  id: string
  story_map_id: string
  name: string
  description: string | null
  goals: string | null
  sort_order: number
  created_at: string
}

export interface Activity {
  id: string
  story_map_id: string
  name: string
  description: string | null
  sort_order: number
  created_at: string
}

export interface Task {
  id: string
  activity_id: string
  name: string
  description: string | null
  sort_order: number
  created_at: string
}

export interface Release {
  id: string
  story_map_id: string
  name: string
  description: string | null
  sort_order: number
  created_at: string
}

export interface Story {
  id: string
  task_id: string
  release_id: string | null
  title: string
  requirements: string
  acceptance_criteria: string
  figma_link: string | null
  edge_cases: string | null
  technical_guidelines: string | null
  status: StoryStatus
  sort_order: number
  created_at: string
  updated_at: string
}

// Joined types for UI
export interface TaskWithStories extends Task {
  stories: Story[]
}

export interface ActivityWithTasks extends Activity {
  tasks: TaskWithStories[]
}

export interface ReleaseWithStories extends Release {
  stories: Story[]
}

export interface StoryMapFull extends StoryMap {
  personas: Persona[]
  activities: ActivityWithTasks[]
  releases: Release[]
}
