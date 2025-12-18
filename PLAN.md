# BeemSpec Implementation Plan

## Overview

BeemSpec is a context and prompt engine for coding agents, with a product management frontend for story mapping. It codifies the workflow of providing detailed requirements, instructing agents to analyze the codebase, create implementation plans, and execute - eliminating repetitive prompt engineering.

**Key Principle**: BeemSpec doesn't interact with code or LLMs directly. It provides structured context and behavioral prompts to coding agents via MCP.

---

## Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | Next.js 14+ (App Router) | Modern React, API routes, TypeScript |
| Database | Supabase (PostgreSQL + JS SDK) | Hosted DB, official SDK, minimal deps |
| MCP Server | @modelcontextprotocol/sdk | Official SDK, runs as separate process |
| Styling | shadcn/ui | Pre-built components with Tailwind (comes bundled) |
| State | React hooks + fetch | Simple for MVP |

---

## Data Model

### Story Map Hierarchy

Based on standard user story mapping structure:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PERSONAS        👤 👤 👤                    👤 👤 👤                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ ACTIVITIES      ┌─────────────────┐         ┌─────────────────┐             │
│ (Journey        │ Onboarding      │         │ Account Setup   │   BACKBONE  │
│  Phases)        │ Process         │         │                 │             │
│                 └─────────────────┘         └─────────────────┘             │
├─────────────────────────────────────────────────────────────────────────────┤
│ TASKS           ┌───────┐┌───────┐┌───────┐ ┌───────┐┌───────┐              │
│ (User           │Welcome││Profile││App    │ │Security│Payment│              │
│  Actions)       │Message││Create ││Tour   │ │Settings│Setup  │              │
│                 └───────┘└───────┘└───────┘ └───────┘└───────┘              │
├─────────────────────────────────────────────────────────────────────────────┤
│ STORIES         ┌───────┐┌───────┐┌───────┐ ┌───────┐┌───────┐              │
│ (Implement-     │Display││Enter  ││Guide  │ │Set up ││Add    │   MVP        │
│  ations)        │welcome││basic  ││through│ │password││payment│   ────────  │
│                 │message││info   ││key    │ │       ││method │   RELEASE    │
│                 └───────┘└───────┘└───────┘ └───────┘└───────┘   SLICES     │
│                 ┌───────┐┌───────┐          ┌───────┐┌───────┐              │
│                 │High-  ││Upload │          │Enable ││Review │   Release 2  │
│                 │light  ││profile│          │2FA    ││billing│   ────────   │
│                 │feature││pic    │          │       ││       │              │
│                 └───────┘└───────┘          └───────┘└───────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Entity Relationship

```
StoryMap (1) ──┬── (N) Activity (1) ── (N) Task (1) ── (N) Story
               │
               ├── (N) Release ──────────────────────── (N) Story
               │
               └── (N) Persona ─────┬── (N) Activity
                                    ├── (N) Task
                                    └── (N) Story
```

**Hierarchy:**
- **Activities**: High-level journey phases (e.g., "Onboarding Process", "Account Setup")
- **Tasks**: User actions within activities (e.g., "Welcome Message", "Profile Creation")
- **Stories**: Specific implementations positioned in a **grid** (task column × release row)
- **Releases**: Horizontal slices that group stories - **the unit for agent planning/implementation**
- **Personas**: Can be attached at any level (activity, task, or story) like StoriesOnBoard

### Schema (PostgreSQL)

```sql
-- Story Maps (containers for the entire map)
CREATE TABLE story_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Personas (user types)
CREATE TABLE personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_map_id UUID NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  goals TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Activities (high-level journey phases - top of backbone)
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_map_id UUID NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks (user actions under activities - second level of backbone)
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Releases (horizontal slices for grouping stories)
CREATE TABLE releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_map_id UUID NOT NULL REFERENCES story_maps(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,  -- Lower = higher priority (MVP = 0)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stories (the actual implementation items)
CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  release_id UUID REFERENCES releases(id) ON DELETE SET NULL,
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

  -- Positioning within task column
  sort_order INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Story-Persona junction (many-to-many)
CREATE TABLE story_personas (
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  PRIMARY KEY (story_id, persona_id)
);

-- Activity-Persona junction
CREATE TABLE activity_personas (
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  PRIMARY KEY (activity_id, persona_id)
);

-- Task-Persona junction
CREATE TABLE task_personas (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, persona_id)
);

-- Indexes for common queries
CREATE INDEX idx_activities_story_map ON activities(story_map_id);
CREATE INDEX idx_tasks_activity ON tasks(activity_id);
CREATE INDEX idx_stories_task ON stories(task_id);
CREATE INDEX idx_stories_release ON stories(release_id);
CREATE INDEX idx_stories_status ON stories(status);
```

---

## Project Structure

```
BeemSpec/
├── package.json
├── next.config.js
├── tsconfig.json
├── components.json                   # shadcn/ui config
├── .env.local                        # Supabase credentials (gitignored)
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
│   │       ├── activities/
│   │       │   └── route.ts
│   │       ├── tasks/
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
│   │   │   ├── ActivityColumn.tsx    # Activity (top backbone) header
│   │   │   ├── TaskColumn.tsx        # Task (sub-backbone) column
│   │   │   ├── StoryCard.tsx         # Individual story card
│   │   │   ├── ReleaseSlice.tsx      # Release divider row
│   │   │   └── PersonaBadge.tsx      # Persona indicator
│   │   └── stories/
│   │       ├── StoryDialog.tsx       # Create/edit story modal
│   │       └── StoryForm.tsx         # Story form with PM fields
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # Browser Supabase client
│   │   │   ├── server.ts             # Server Supabase client
│   │   │   └── queries/              # Query functions by entity
│   │   │       ├── story-maps.ts
│   │   │       ├── activities.ts
│   │   │       ├── tasks.ts
│   │   │       ├── stories.ts
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
│   │   └── supabase.ts               # Supabase client for MCP server
│   └── README.md                     # MCP setup instructions
│
└── supabase/
    └── migrations/                   # SQL migrations (optional, can use Supabase dashboard)
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
    task: {
      name: "...",
      activity: { name: "..." }  // Full hierarchy context
    },
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
        "SUPABASE_URL": "https://xxx.supabase.co",
        "SUPABASE_SERVICE_KEY": "eyJ..."
      }
    }
  }
}
```

The MCP server uses the same Supabase credentials as the web app. Use the **service role key** (not anon key) for the MCP server since it runs locally and needs full access.

---

## UI Design

### Dashboard (Home Page)
- List of story maps (cards with name, description, stats)
- Create new story map button
- Quick stats (total stories, in progress, done)

### Story Map Canvas

The canvas reflects the 3-level backbone hierarchy from the reference images:

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│  Story Map: [Name]                                       [Personas] [Settings]     │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                    │
│  PERSONAS     👤 👤                              👤 👤 👤                          │
│               ─────                              ─────────                          │
│                                                                                    │
│  ┌─────────────────────────────────┐    ┌─────────────────────────────────┐       │
│  │        ONBOARDING PROCESS       │    │         ACCOUNT SETUP           │  [+]  │
│  │          (Activity)             │    │          (Activity)             │       │
│  └─────────────────────────────────┘    └─────────────────────────────────┘       │
│                                                                                    │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐    ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Welcome │ │ Profile │ │  App    │    │Security │ │ Payment │ │ Notif.  │  [+]  │
│  │ Message │ │ Creation│ │  Tour   │    │ Settings│ │  Setup  │ │ Prefs   │       │
│  │ (Task)  │ │ (Task)  │ │ (Task)  │    │ (Task)  │ │ (Task)  │ │ (Task)  │       │
│  └─────────┘ └─────────┘ └─────────┘    └─────────┘ └─────────┘ └─────────┘       │
│  ═══════════════════════════════════════════════════════════════════════ MVP ════ │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐    ┌─────────┐ ┌─────────┐                   │
│  │ Display │ │ Enter   │ │ Guide   │    │ Set up  │ │  Add    │                   │
│  │ welcome │ │ basic   │ │ through │    │ password│ │ payment │     Stories       │
│  │ message │ │ info    │ │ key     │    │         │ │ method  │                   │
│  │  ●●●○○  │ │  ●●○○○  │ │ ●●●●○   │    │  ●○○○○  │ │  ○○○○○  │                   │
│  └─────────┘ └─────────┘ └─────────┘    └─────────┘ └─────────┘                   │
│  ══════════════════════════════════════════════════════════════ Release 2 ═══════ │
│  ┌─────────┐ ┌─────────┐                ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │Highlight│ │ Upload  │                │ Enable  │ │ Review  │ │ Choose  │       │
│  │ key     │ │ profile │                │  2FA    │ │ billing │ │ notif.  │       │
│  │ features│ │ picture │                │         │ │ details │ │ types   │       │
│  │  ○○○○○  │ │  ○○○○○  │                │  ○○○○○  │ │  ○○○○○  │ │  ○○○○○  │       │
│  └─────────┘ └─────────┘                └─────────┘ └─────────┘ └─────────┘       │
│                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Layout Structure:**
- **Personas Row**: User type icons at top, linked to activities
- **Activities Row**: High-level journey phases (top backbone)
- **Tasks Row**: User actions grouped under activities (second backbone level)
- **Release Slices**: Horizontal dividers (MVP, Release 2, etc.)
- **Story Cards**: Grid below tasks, positioned by task column and release row

**Interactions:**
- Click activity/task to edit inline
- Click story card to open detail dialog
- Drag-and-drop stories between tasks and releases
- [+] buttons to add activities, tasks, or stories
- Status indicators (●○) show progress at a glance

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
- [ ] Initialize Next.js project with TypeScript (`create-next-app`)
- [ ] Set up Supabase project and get credentials
- [ ] Install @supabase/supabase-js
- [ ] Set up shadcn/ui (includes Tailwind)
- [ ] Create database tables via Supabase SQL editor
- [ ] Configure Supabase client (browser + server)

### Phase 2: Core Data Layer
- [ ] Define TypeScript types for all entities
- [ ] Implement Supabase query functions for each entity
- [ ] Create API routes for CRUD operations
- [ ] Test queries with sample data

### Phase 3: Story Map UI
- [ ] Dashboard page (list story maps, create new)
- [ ] Story map canvas with grid layout (tasks × releases)
- [ ] Activity row component (spans multiple tasks)
- [ ] Task column component
- [ ] Story card component with status indicator
- [ ] Release slice rows
- [ ] Story dialog with PM quality form fields
- [ ] Persona badges (attachable at any level)

### Phase 4: MCP Server
- [ ] Set up MCP server as separate package
- [ ] Configure Supabase client with service key
- [ ] Implement `get_story_context` tool with agent instructions
- [ ] Implement `get_release_context` tool (the main planning unit)
- [ ] Implement `update_story_status` tool
- [ ] Implement `list_ready_stories` tool
- [ ] Write setup/configuration documentation

### Phase 5: Polish & Integration
- [ ] Drag-and-drop reordering (activities, tasks, stories)
- [ ] Persona management panel
- [ ] Release management panel
- [ ] Inline editing for activities/tasks
- [ ] Requirements quality indicators (completeness scoring)

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

1. A PM can create a story map with activities, tasks, releases, and stories
2. Stories enforce quality fields (requirements, acceptance criteria)
3. The 3-level backbone (activities → tasks → stories) renders correctly
4. An engineer can configure Claude Code to use the MCP server
5. Calling `get_story_context` returns the story + behavioral prompts
6. The agent creates a PLAN.md before implementing (guided by prompts)
7. Story status can be updated via MCP from within the coding agent

---

## Next Steps

Upon approval of this plan:

1. Initialize the Next.js project
2. Set up the database and schema
3. Build the data layer (queries + API routes)
4. Create the UI components
5. Build the MCP server
6. Test end-to-end flow
