// =============================================================================
// Story Map Kernel — Type Definitions
//
// The spatial model: Activities x Releases grid, with Tasks and Stories.
// Stories carry structured content fields designed for both human and
// AI-agent consumption.
// =============================================================================

/** Root container for a story map. */
export interface StoryMap {
  id: string;
  name: string;
  description?: string | null;
  context_markdown?: string | null;
}

/** A named, ordered column group across the top of the map. */
export interface Activity {
  id: string;
  story_map_id: string;
  name: string;
  description?: string | null;
  sort_order: number;
}

/** A column within an activity group (second row). */
export interface Task {
  id: string;
  activity_id: string;
  name: string;
  description?: string | null;
  sort_order: number;
}

/** A horizontal swim lane (release band). null release_id = backlog. */
export interface Release {
  id: string;
  story_map_id: string;
  name: string;
  description?: string | null;
  context_markdown?: string | null;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Story content — the structured spec that makes the map useful
// ---------------------------------------------------------------------------

export type StoryStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';

/**
 * Structured spec fields stored as JSON on each story.
 *
 * These fields are the minimum context a human or AI agent needs to build
 * from a story without follow-up questions.
 *
 * The `_version` field enables forward-compatible schema evolution:
 *   - Additive optional fields don't require a version bump.
 *   - Breaking changes or semantic shifts bump the version.
 */
export interface StoryContent {
  _version: 1;
  /** The user story — who wants what and why. */
  user_story: string;
  /** The "done" — how do we verify it works. */
  acceptance_criteria: string;
  /** Design reference — what it should look like. */
  figma_link?: string | null;
  /** The "what could go wrong" — failure modes to handle. */
  edge_cases?: string | null;
  /** The "how" constraints — implementation guidance. */
  technical_guidelines?: string | null;
}

/** A card that lives in one cell: (task_column, release_row). */
export interface Story {
  id: string;
  task_id: string;
  release_id: string | null; // null = backlog
  sort_order: number;
  status: StoryStatus;
  title: string;
  content: StoryContent;
}

// ---------------------------------------------------------------------------
// Joined tree types for rendering the full grid in one pass
// ---------------------------------------------------------------------------

export interface TaskWithStories extends Task {
  stories: Story[];
}

export interface ActivityWithTasks extends Activity {
  tasks: TaskWithStories[];
}

export interface StoryMapFull extends StoryMap {
  activities: ActivityWithTasks[];
  releases: Release[];
}
