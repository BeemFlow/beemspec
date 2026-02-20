# Plan: Extract Story Map Kernel as a Standalone Package

## Problem

Story mapping is the most important planning primitive missing from product management tooling. Kanban boards, backlogs, and flat task lists don't capture the spatial relationship between user activities, tasks, and release slicing. Every existing story map tool is monolithic -- tightly coupled to one product's backend, auth, and workflow.

AI coding agents make this worse. They need structured, complete context to produce good output, and the story map is the natural place to capture that context. But no reusable primitive exists for the story map data model + spatial operations.

## Goal

Extract the story map layer from BeemSpec into a standalone, headless TypeScript package that any product can import. The package is opinionated about two things:

1. **The spatial model**: activities, tasks, releases, and stories arranged in a 2D grid.
2. **The story content model**: structured spec fields designed for both human and AI consumption.

It has zero opinions about persistence, UI rendering, auth, or integrations.

## Design Decisions

### Keep relational structure for the spatial model

The spatial entities (story_maps, activities, tasks, releases) stay as separate records with sort_order. This is critical for:

- **Concurrent editing**: two users can reorder different activities without conflict.
- **Scale**: a map with 1,000 stories doesn't require loading/writing the entire map on every mutation.
- **Efficient queries**: "give me all stories in release X" is an indexed lookup, not a JSON scan.

### JSON content at the story level

Replace individual story spec columns with a single `content` JSON field. The story record becomes:

```
stories
├── id              (uuid, PK)
├── task_id         (uuid, FK → tasks)
├── release_id      (uuid, nullable FK → releases, null = backlog)
├── title           (text, NOT NULL — kept scalar for display and search)
├── sort_order      (integer)
├── status          (text, indexed — kept scalar for filtering)
├── content         (jsonb, NOT NULL — the structured spec, versioned via _version field)
├── created_at      (timestamptz)
└── updated_at      (timestamptz)
```

The `content` field schema:

```json
{
  "_version": 1,
  "requirements": "As a user, I want to sign in with my Google account so that...",
  "acceptance_criteria": "- [ ] Google OAuth button on login page\n- [ ] Successful auth creates/links user account",
  "figma_link": "https://figma.com/file/...",
  "edge_cases": "- User cancels OAuth flow\n- Email already exists with password auth",
  "technical_guidelines": "Use NextAuth.js with Google provider. Follow existing auth patterns."
}
```

All six fields are part of the kernel schema. They exist because they're the minimum structured context a human or AI agent needs to build from a story:

| Field | Location | Required | Purpose |
|---|---|---|---|
| `title` | scalar column | yes | Identity — what is this story. Kept as a column for display and search. |
| `_version` | content JSON | yes | Schema version for forward-compatible evolution of content fields. |
| `requirements` | content JSON | yes | The "what" — what should be built |
| `acceptance_criteria` | content JSON | yes | The "done" — how do we verify it works |
| `figma_link` | content JSON | no | Design reference — what it should look like |
| `edge_cases` | content JSON | no | The "what could go wrong" — failure modes to handle |
| `technical_guidelines` | content JSON | no | The "how" constraints — implementation guidance |

These fields are not BeemSpec-specific. They are the minimum spec for context engineering — giving AI agents (or humans) enough structured information to build correctly without follow-up questions.

`status` is kept as a scalar column (not inside `content`) because:
- It's frequently filtered/grouped in UI and queries.
- It's a workflow concern (position in process), not a content concern (what to build).
- Indexing a top-level column is simpler than a JSONB expression index.

### Why not a single JSON document for the whole map

A map with 1,000 stories across 50 tasks and 10 releases can't be a single JSON blob because:

- **Write contention**: two users editing different stories would require full-document compare-and-swap. With separate rows, they update independent records.
- **Payload size**: full-document writes of 1-3 MB on every card edit are wasteful.
- **Partial loading**: you might want to lazy-load stories per release row, not the entire map upfront.

The hybrid approach (relational structure + JSON content per story) gives you document-like flexibility for spec content with relational integrity for the spatial model.

## Package Scope

### What the package exports

```
@beemspec/storymap
├── types.ts          — Data model types (4 spatial entities + story with content)
├── content.ts        — Content schema, validation, defaults
├── operations.ts     — Pure functions: reorder, move, re-parent, CRUD
├── tree.ts           — Flat arrays ↔ nested tree transformations
├── useStoryMap.ts    — React hook: in-memory state + drag coordination
└── index.ts          — Public API
```

### Types (the opinionated data model)

```typescript
// --- Spatial entities ---

interface StoryMap {
  id: string;
  name: string;
  description?: string;
}

interface Activity {
  id: string;
  story_map_id: string;
  name: string;
  description?: string;
  sort_order: number;
}

interface Task {
  id: string;
  activity_id: string;
  name: string;
  description?: string;
  sort_order: number;
}

interface Release {
  id: string;
  story_map_id: string;
  name: string;
  description?: string;
  sort_order: number;
}

// --- Story content ---

type StoryStatus = 'backlog' | 'ready' | 'in_progress' | 'review' | 'done';

interface StoryContent {
  _version: 1;
  requirements: string;
  acceptance_criteria: string;
  figma_link?: string;
  edge_cases?: string;
  technical_guidelines?: string;
}

interface Story {
  id: string;
  task_id: string;
  release_id: string | null;   // null = backlog
  sort_order: number;
  status: StoryStatus;
  title: string;
  content: StoryContent;
}

// --- Joined tree for rendering ---

interface TaskWithStories extends Task {
  stories: Story[];
}

interface ActivityWithTasks extends Activity {
  tasks: TaskWithStories[];
}

interface StoryMapFull extends StoryMap {
  activities: ActivityWithTasks[];
  releases: Release[];
}
```

### Operations (pure functions)

```typescript
// Reorder any sortable list
reorderItems(ids: string[], movedId: string, targetId?: string): string[]

// Move a story to a different cell
moveStory(story: Story, toTaskId: string, toReleaseId: string | null): Story

// Move a task to a different activity
moveTask(task: Task, toActivityId: string): Task

// CRUD helpers that return new state (immutable)
addActivity(map: StoryMapFull, activity: Activity): StoryMapFull
addTask(map: StoryMapFull, activityId: string, task: Task): StoryMapFull
addRelease(map: StoryMapFull, release: Release): StoryMapFull
addStory(map: StoryMapFull, story: Story): StoryMapFull
updateStory(map: StoryMapFull, storyId: string, patch: Partial<Story>): StoryMapFull
removeStory(map: StoryMapFull, storyId: string): StoryMapFull
// ... remove/update for other entities
```

### Tree transformations

```typescript
// Build nested tree from flat arrays (what you get from a DB query)
buildTree(
  map: StoryMap,
  activities: Activity[],
  tasks: Task[],
  releases: Release[],
  stories: Story[]
): StoryMapFull

// Flatten tree back to arrays (for persistence)
flattenTree(map: StoryMapFull): {
  map: StoryMap;
  activities: Activity[];
  tasks: Task[];
  releases: Release[];
  stories: Story[];
}

// Cell lookup
getStoriesForCell(map: StoryMapFull, taskId: string, releaseId: string | null): Story[]
getTasksForActivity(map: StoryMapFull, activityId: string): Task[]
```

### React hook (optional, tree-shakeable)

```typescript
function useStoryMap(initial: StoryMapFull): {
  map: StoryMapFull;

  // Spatial mutations
  reorderActivities(movedId: string, targetId?: string): void;
  reorderTasks(activityId: string, movedId: string, targetId?: string): void;
  reorderStories(taskId: string, releaseId: string | null, movedId: string, targetId?: string): void;
  moveStory(storyId: string, toTaskId: string, toReleaseId: string | null): void;
  moveTask(taskId: string, toActivityId: string): void;

  // CRUD
  addActivity(name: string): Activity;
  addTask(activityId: string, name: string): Task;
  addRelease(name: string): Release;
  addStory(taskId: string, releaseId: string | null, title: string, content: StoryContent): Story;
  updateStory(storyId: string, patch: Partial<{ title: string; status: StoryStatus; content: StoryContent }>): void;
  removeStory(storyId: string): void;
  // ... etc

  // Drag-and-drop coordination
  dragState: DragState | null;
  onDragStart(id: DragId): void;
  onDragOver(id: DragId): void;
  onDragEnd(): PendingMutation | null;  // returns what changed, caller persists
}
```

The hook manages in-memory state and emits `PendingMutation` objects that the consumer is responsible for persisting. It never calls an API, never touches a database. The consumer decides how and when to persist.

### What the package does NOT include

- No UI components (no React components, no CSS, no design system)
- No persistence layer (no SQL, no Supabase, no IndexedDB)
- No auth or team model
- No Linear/Jira/GitHub integration
- No AI agent orchestration (no MCP, no OpenCode, no build runs)
- No personas (BeemSpec-specific concept that can be layered on top)

## How BeemSpec Uses It

BeemSpec imports `@beemspec/storymap` and layers on top:

1. **Persistence**: Supabase tables matching the kernel types, with `content` as a JSONB column.
2. **Auth/teams**: RLS policies, team scoping on `story_maps.team_id`.
3. **Linear sync**: reads `story.content` fields to format Linear issue descriptions.
4. **Build runs**: reads `story.content` to seed AI agent prompts.
5. **MCP server**: exposes `story.content` to AI agents mid-session.
6. **Personas**: additional tables that reference kernel entity IDs.

Since we're pre-launch, we reset the schema rather than stacking migrations. The new `stories` table in `001_schema.sql` becomes:

```sql
CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  release_id UUID REFERENCES releases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT DEFAULT 'backlog' CHECK(status IN ('backlog', 'ready', 'in_progress', 'review', 'done')),
  content JSONB NOT NULL DEFAULT '{"_version": 1, "requirements": "", "acceptance_criteria": ""}',
  sort_order INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

The individual spec columns (`requirements`, `acceptance_criteria`, `figma_link`, `edge_cases`, `technical_guidelines`) are removed. `title` and `status` stay as scalar columns. Everything else lives in `content`.

## How Others Use It

### Vibe Kanban (or similar agent orchestrator)

```typescript
import { buildTree, useStoryMap, type StoryMapFull } from '@beemspec/storymap';

// Load from their SQLite DB
const map = buildTree(mapRow, activityRows, taskRows, releaseRows, storyRows);

// Use the hook for in-memory state + drag
const { map: current, moveStory, addStory, onDragEnd } = useStoryMap(map);

// On drag end, persist the mutation to SQLite
const mutation = onDragEnd();
if (mutation) await persistToSQLite(mutation);

// When dispatching to an AI agent, read structured content
const story = getStory(current, storyId);
const prompt = `Build: ${story.title}\n${story.content.requirements}\n\nDone when:\n${story.content.acceptance_criteria}`;
```

### Linear integration (any consumer)

```typescript
import { type StoryContent } from '@beemspec/storymap';

function storyToLinearDescription(story: Story): string {
  const { content } = story;
  let desc = `## Requirements\n${content.requirements}\n\n`;
  desc += `## Acceptance Criteria\n${content.acceptance_criteria}\n`;
  if (content.figma_link) desc += `\n## Design\n${content.figma_link}\n`;
  if (content.edge_cases) desc += `\n## Edge Cases\n${content.edge_cases}\n`;
  if (content.technical_guidelines) desc += `\n## Technical Guidelines\n${content.technical_guidelines}\n`;
  return desc;
}
```

### AI agent (MCP tool consumer)

```typescript
import { type Story } from '@beemspec/storymap';

// Agent receives story via MCP tool
function buildPromptFromStory(story: Story): string {
  const { content } = story;
  return [
    `# ${story.title}`,
    `## Requirements\n${content.requirements}`,
    `## Acceptance Criteria\n${content.acceptance_criteria}`,
    content.edge_cases && `## Edge Cases\n${content.edge_cases}`,
    content.technical_guidelines && `## Technical Guidelines\n${content.technical_guidelines}`,
    content.figma_link && `## Design Reference\n${content.figma_link}`,
  ].filter(Boolean).join('\n\n');
}
```

## Implementation Steps

### Phase 1: Extract the package

1. Create `packages/storymap/` with the types, operations, tree utils, and content validation.
2. Port `drag-order.ts` (already pure) and expand into full operations module.
3. Write `buildTree` / `flattenTree` based on existing page.tsx data assembly logic.
4. Write `useStoryMap` hook wrapping the pure operations with React state.
5. Add content validation (zod schema for `StoryContent`).
6. Tests for all pure functions (operations, tree transforms, content validation).

### Phase 2: Migrate BeemSpec to use the package

1. Reset `001_schema.sql` with the new stories table (content JSONB, title + status scalar). Pre-launch, no migration needed.
2. Update all API routes to read/write `content` JSON instead of individual spec columns.
3. Update StoryDialog to read/write through `StoryContent` type.
4. Update Linear sync to format from `story.content`.
5. Update build run processor to read from `story.content`.
6. Update MCP server to return `story.content`.
7. Update validation schemas (zod) for the new shape.

### Phase 3: Publish and document

1. Publish `@beemspec/storymap` to npm.
2. Write README explaining the data model, content fields, and usage patterns.
3. Include reference SQL schema (Postgres, SQLite) as examples, not requirements.
4. Include the "why these fields" rationale for each content field.

## Resolved Decisions

- **`title` stays as a scalar column, not duplicated in content.** It's used for card display and search. The `content` JSON holds everything else. The `Story` type has both `title: string` and `content: StoryContent` as siblings.
- **Content schema versioning via `_version` field.** The `content` JSON includes a `_version: 1` field. When the schema evolves (new fields, changed semantics), bump the version. Consumers can migrate content on read or via a batch script. New optional fields can be added without bumping (additive-only). Version bumps are for breaking changes or semantic shifts.
- **Package ships reference SQL.** Not as a runtime dependency, but as documented examples in `packages/storymap/sql/` with Postgres and SQLite variants. Consumers copy and adapt; they're not executed by the package.
