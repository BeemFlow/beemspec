# @beemspec/storymap

Headless story map kernel — types, validation schemas, and pure ordering/content helpers for Jeff Patton-style story mapping.

## What this is

A standalone, headless TypeScript package that provides the data model and spatial operations for story mapping. It is opinionated about two things:

1. **The spatial model**: Activities, tasks, releases, and stories arranged in a 2D grid.
2. **The story content model**: Structured spec fields designed for both human and AI-agent consumption.

It has zero opinions about persistence, UI rendering, auth, or integrations.

## Data model

A story map is a four-level tree cross-cut by releases:

```
StoryMap
  ├── Activities (ordered column groups)
  │     └── Tasks (ordered columns within an activity)
  └── Releases (ordered rows)

Stories sit at the intersection of (task, release).
release_id = null means backlog.
```

Each story carries structured content:

| Field | Location | Required | Purpose |
|---|---|---|---|
| `title` | scalar | yes | Identity — what is this story |
| `status` | scalar | yes | Workflow state (backlog, todo, in_progress, in_review, done) |
| `user_story` | content JSON | yes | The user story — who wants what and why |
| `acceptance_criteria` | content JSON | yes | The "done" — how to verify it works |
| `figma_link` | content JSON | no | Design reference |
| `edge_cases` | content JSON | no | Failure modes to handle |
| `technical_guidelines` | content JSON | no | Implementation guidance |

The content JSON includes a `_version` field for forward-compatible schema evolution.

## Installation

```bash
npm install @beemspec/storymap
```

## Usage

### Types

```typescript
import type { Story, StoryContent, StoryMapFull, Activity, Task, Release } from '@beemspec/storymap';
```

### Ordering helper

```typescript
import { reorderItems } from '@beemspec/storymap';

// Reorder items in a lane
const newOrder = reorderItems(['a', 'b', 'c'], 'c', 'a'); // ['c', 'a', 'b']
```

### Content helpers

```typescript
import { createContent, emptyContent, isStoryContent } from '@beemspec/storymap';

const content = createContent({
  user_story: 'As a user, I want to sign in with Google...',
  acceptance_criteria: '- [ ] Google OAuth button on login page',
  technical_guidelines: 'Use NextAuth.js with Google provider',
});

const blank = emptyContent();
```

## Why these content fields

These fields exist because they are the minimum structured context a human or AI agent needs to build from a story:

- **User story**: Who wants what and why. Without this, the story loses its core user value.
- **Acceptance criteria**: How to verify it works. Without this, no one can confirm the work is done.
- **Edge cases**: What could go wrong. Prevents both humans and AI from missing failure modes.
- **Technical guidelines**: Implementation constraints. Keeps the work within architectural boundaries.
- **Figma link**: Design reference. Shows what it should look like.
- **`_version`**: Forward-compatible schema evolution without breaking existing consumers.
