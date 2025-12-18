# BeemSpec Implementation Plan

## Overview

BeemSpec is a context and prompt engine for coding agents, with a product management frontend for story mapping. It codifies the workflow of providing detailed requirements, instructing agents to analyze the codebase, create implementation plans, and execute - eliminating repetitive prompt engineering.

**Key Principle**: BeemSpec doesn't interact with code or LLMs directly. It provides structured context and behavioral prompts to coding agents via MCP.

---

## Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | Next.js 14+ (App Router) | Modern React, API routes, TypeScript |
| Database | SQLite + better-sqlite3 | Simple, file-based, no server needed |
| MCP Server | @modelcontextprotocol/sdk | Official SDK, runs as separate process |
| Styling | Tailwind CSS + shadcn/ui | Rapid development, good defaults |
| State | React hooks + fetch | Simple for MVP, no need for Redux/Zustand |

---

## Data Model

### Entity Relationship

```
StoryMap (1) ──┬── (N) BackboneItem (1) ── (N) Story
               │
               └── (N) Release (1) ── (N) Story
               │
               └── (N) Persona (N) ── (N) Story
```

### Schema

```sql
-- Story Maps (containers for the entire map)
CREATE TABLE story_maps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Personas (user types)
CREATE TABLE personas (
  id TEXT PRIMARY KEY,
  story_map_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  goals TEXT,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (story_map_id) REFERENCES story_maps(id) ON DELETE CASCADE
);

-- Backbone Items (horizontal journey steps)
CREATE TABLE backbone_items (
  id TEXT PRIMARY KEY,
  story_map_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (story_map_id) REFERENCES story_maps(id) ON DELETE CASCADE
);

-- Releases (horizontal slices for grouping stories)
CREATE TABLE releases (
  id TEXT PRIMARY KEY,
  story_map_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (story_map_id) REFERENCES story_maps(id) ON DELETE CASCADE
);

-- Stories (the actual tasks/features)
CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  backbone_item_id TEXT NOT NULL,
  release_id TEXT,
  title TEXT NOT NULL,

  -- PM Quality Fields (enforced)
  requirements TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,

  -- Optional but encouraged
  figma_link TEXT,
  edge_cases TEXT,
  technical_guidelines TEXT,

  -- Status tracking
  status TEXT DEFAULT 'backlog' CHECK(status IN ('backlog', 'ready', 'in_progress', 'review', 'done')),

  -- Positioning
  sort_order INTEGER DEFAULT 0,

  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (backbone_item_id) REFERENCES backbone_items(id) ON DELETE CASCADE,
  FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE SET NULL
);

-- Story-Persona junction (many-to-many)
CREATE TABLE story_personas (
  story_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  PRIMARY KEY (story_id, persona_id),
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
);
```

---

## Project Structure

```
BeemSpec/
├── package.json
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
│
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout
│   │   ├── page.tsx                  # Dashboard (list of story maps)
│   │   │
│   │   ├── story-map/
│   │   │   └── [id]/
│   │   │       ├── page.tsx          # Story map canvas view
│   │   │       └── settings/
│   │   │           └── page.tsx      # Map settings (personas, releases)
│   │   │
│   │   └── api/                      # API Routes
│   │       ├── story-maps/
│   │       │   ├── route.ts          # GET all, POST create
│   │       │   └── [id]/
│   │       │       └── route.ts      # GET, PUT, DELETE single
│   │       ├── backbone-items/
│   │       │   └── route.ts
│   │       ├── stories/
│   │       │   ├── route.ts
│   │       │   └── [id]/
│   │       │       └── route.ts
│   │       ├── personas/
│   │       │   └── route.ts
│   │       └── releases/
│   │           └── route.ts
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn/ui components
│   │   ├── story-map/
│   │   │   ├── StoryMapCanvas.tsx    # Main story map view
│   │   │   ├── BackboneItem.tsx      # Backbone column header
│   │   │   ├── StoryCard.tsx         # Individual story card
│   │   │   ├── ReleaseRow.tsx        # Release slice indicator
│   │   │   └── PersonaBadge.tsx      # Persona indicator
│   │   └── stories/
│   │       ├── StoryDialog.tsx       # Create/edit story modal
│   │       └── StoryForm.tsx         # Story form with PM fields
│   │
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts              # Database connection
│   │   │   ├── schema.ts             # Schema initialization
│   │   │   └── queries/              # Query functions by entity
│   │   │       ├── story-maps.ts
│   │   │       ├── stories.ts
│   │   │       ├── backbone-items.ts
│   │   │       ├── personas.ts
│   │   │       └── releases.ts
│   │   └── utils.ts                  # Utility functions
│   │
│   └── types/
│       └── index.ts                  # TypeScript interfaces
│
├── mcp-server/                       # Standalone MCP server
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                  # MCP server entry point
│   │   ├── tools/                    # MCP tool definitions
│   │   │   ├── get-story.ts
│   │   │   ├── get-release-context.ts
│   │   │   ├── update-story-status.ts
│   │   │   └── list-stories.ts
│   │   ├── prompts/
│   │   │   └── agent-instructions.ts # Built-in behavioral prompts
│   │   └── db/
│   │       └── index.ts              # Shared DB access
│   └── README.md                     # MCP setup instructions
│
└── data/
    └── beemspec.db                   # SQLite database file
```

---

## MCP Server Design

### The "Trick": Embedded Agent Instructions

Every MCP tool response includes behavioral prompts that guide the coding agent. This is the key value proposition.

### Tools

#### 1. `get_story_context`
**Input**: `{ story_id: string }`
**Returns**: Full story context + agent instructions

```typescript
{
  story: {
    id: "...",
    title: "...",
    requirements: "...",
    acceptance_criteria: "...",
    figma_link: "...",
    edge_cases: "...",
    technical_guidelines: "...",
    personas: [...],
    backbone_item: { name: "..." },
    release: { name: "..." }
  },
  agent_instructions: `
## Before You Begin

1. **Sweep the Codebase**: Before making any changes, thoroughly analyze the existing codebase structure, patterns, and conventions. Understand:
   - Directory organization
   - Naming conventions
   - Code patterns and architectural decisions
   - Existing utilities and helpers you should reuse
   - Testing patterns

2. **Create PLAN.md**: Write a comprehensive implementation plan in PLAN.md at the repo root. Include:
   - Overview of changes
   - Files to be created/modified
   - Step-by-step implementation approach
   - Potential risks or concerns
   - Testing strategy

   **STOP and wait for user approval before executing the plan.**

3. **Maintain Consistency**: Your implementation must:
   - Follow existing code organization patterns
   - Use established naming conventions
   - Reuse existing utilities rather than creating duplicates
   - Match the code style of surrounding files

4. **Implementation Standards**:
   - Address all acceptance criteria
   - Handle edge cases listed in the story
   - Follow technical guidelines if provided
   - Write tests following existing test patterns

## Story Context
[Story details injected here]
  `
}
```

#### 2. `get_release_context`
**Input**: `{ release_id: string }`
**Returns**: All stories in a release for broader context

#### 3. `update_story_status`
**Input**: `{ story_id: string, status: 'backlog' | 'ready' | 'in_progress' | 'review' | 'done' }`
**Returns**: Confirmation + next suggested actions

#### 4. `list_ready_stories`
**Input**: `{ story_map_id?: string, release_id?: string }`
**Returns**: Stories with status 'ready' for implementation

### MCP Configuration (for Claude Code)

```json
{
  "mcpServers": {
    "beemspec": {
      "command": "node",
      "args": ["/path/to/BeemSpec/mcp-server/dist/index.js"],
      "env": {
        "BEEMSPEC_DB_PATH": "/path/to/BeemSpec/data/beemspec.db"
      }
    }
  }
}
```

---

## UI Design

### Dashboard (Home Page)
- List of story maps
- Create new story map button
- Quick stats (total stories, in progress, etc.)

### Story Map Canvas
A visual board layout:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Story Map: [Name]                              [Settings] [Export] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  [+ Add]   │
│  │  Sign Up │  │  Setup   │  │   Use    │  │  Share   │  Backbone  │
│  │          │  │ Profile  │  │ Feature  │  │ Results  │            │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │
│  ─────────────────────────────────────────────────────── Release 1 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                          │
│  │ Email    │  │ Basic    │  │ Core     │                          │
│  │ signup   │  │ profile  │  │ workflow │                          │
│  │ ●●○○○    │  │ ●●●○○    │  │ ●●●●○    │                          │
│  └──────────┘  └──────────┘  └──────────┘                          │
│  ─────────────────────────────────────────────────────── Release 2 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ OAuth    │  │ Avatar   │  │ Advanced │  │ PDF      │            │
│  │ login    │  │ upload   │  │ filters  │  │ export   │            │
│  │ ○○○○○    │  │ ○○○○○    │  │ ○○○○○    │  │ ○○○○○    │            │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

- Backbone items as columns
- Release slices as horizontal dividers
- Story cards positioned under their backbone, within their release
- Drag-and-drop for reordering
- Click card to open story detail dialog

### Story Dialog/Form
Modal with enforced PM quality fields:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Story Details                                               [×]    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Title *                                                            │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ OAuth login with Google                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Requirements * (What should be built?)                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ As a user, I want to sign in with my Google account so      │   │
│  │ that I don't need to remember another password...           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Acceptance Criteria * (How do we know it's done?)                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ - [ ] Google OAuth button on login page                     │   │
│  │ - [ ] Successful auth creates/links user account            │   │
│  │ - [ ] Error states handled gracefully                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Figma Link                                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ https://figma.com/file/...                                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Edge Cases (What could go wrong?)                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ - User cancels OAuth flow                                   │   │
│  │ - Email already exists with password auth                   │   │
│  │ - Google returns insufficient permissions                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Technical Guidelines (Optional implementation hints)               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Use NextAuth.js with Google provider. Follow existing       │   │
│  │ auth patterns in src/lib/auth/...                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Personas: [Admin ×] [User ×] [+ Add]                               │
│                                                                     │
│  Status: [Backlog ▼]    Release: [Release 1 ▼]                      │
│                                                                     │
│                                        [Cancel]  [Save Story]       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Project Setup
- [ ] Initialize Next.js project with TypeScript
- [ ] Install dependencies (better-sqlite3, tailwindcss, etc.)
- [ ] Set up shadcn/ui
- [ ] Create database schema and initialization
- [ ] Set up basic project structure

### Phase 2: Core Data Layer
- [ ] Implement database queries for all entities
- [ ] Create API routes for CRUD operations
- [ ] Add TypeScript types for all entities

### Phase 3: Story Map UI
- [ ] Dashboard page (list story maps)
- [ ] Story map canvas component
- [ ] Backbone item management
- [ ] Story card component
- [ ] Release slice visualization
- [ ] Story dialog with form validation

### Phase 4: MCP Server
- [ ] Set up MCP server project structure
- [ ] Implement `get_story_context` tool with agent instructions
- [ ] Implement `get_release_context` tool
- [ ] Implement `update_story_status` tool
- [ ] Implement `list_ready_stories` tool
- [ ] Write setup documentation

### Phase 5: Polish & Integration
- [ ] Drag-and-drop reordering
- [ ] Persona management UI
- [ ] Release management UI
- [ ] Requirements quality indicators
- [ ] Export functionality (optional)

---

## Agent Instructions Template

The following prompts are embedded in MCP tool responses:

```typescript
export const AGENT_INSTRUCTIONS = {
  beforeImplementation: `
## Before You Begin

1. **Analyze the Codebase**
   Before making any changes, thoroughly analyze the existing codebase:
   - Directory structure and organization patterns
   - Naming conventions (files, functions, variables)
   - Architectural patterns (how data flows, state management)
   - Existing utilities and helpers to reuse
   - Testing patterns and coverage expectations

2. **Create Implementation Plan**
   Create a PLAN.md file at the repository root with:
   - Summary of the feature/change
   - List of files to create or modify
   - Step-by-step implementation approach
   - Dependencies or prerequisites
   - Potential risks or areas needing clarification
   - Testing strategy

   **IMPORTANT: Stop and wait for user approval before proceeding.**

3. **Implementation Standards**
   When implementing:
   - Follow existing code organization exactly
   - Match surrounding code style
   - Reuse existing utilities (don't reinvent)
   - Handle all edge cases from the story
   - Follow technical guidelines if provided
   - Write tests matching existing patterns
`,

  afterCompletion: `
## After Implementation

1. Verify all acceptance criteria are met
2. Run existing tests to ensure no regressions
3. Update story status via BeemSpec MCP
`,

  statusUpdatePrompt: (newStatus: string) => `
Story status updated to "${newStatus}".
${newStatus === 'in_progress' ? 'Remember to create PLAN.md before implementing.' : ''}
${newStatus === 'done' ? 'Great work! Consider running tests to verify.' : ''}
`
};
```

---

## Open Questions / Future Considerations

1. **Multi-user support**: For MVP, single-user is fine. Future: add auth + workspaces.

2. **Version history**: Should stories track change history? Defer for MVP.

3. **GitHub/Linear sync**: Mentioned in README as "coming soon" - not in MVP scope.

4. **Story dependencies**: Some stories depend on others. Add later if needed.

5. **Custom agent instructions**: Let users customize the behavioral prompts per story map?

---

## Success Criteria

The MVP is successful when:

1. A PM can create a story map with backbone, releases, and stories
2. Stories enforce quality fields (requirements, acceptance criteria)
3. An engineer can configure Claude Code to use the MCP server
4. Calling `get_story_context` returns the story + behavioral prompts
5. The agent creates a PLAN.md before implementing (guided by prompts)
6. Story status can be updated via MCP from within the coding agent

---

## Next Steps

Upon approval of this plan:

1. Initialize the Next.js project
2. Set up the database and schema
3. Build the data layer (queries + API routes)
4. Create the UI components
5. Build the MCP server
6. Test end-to-end flow
