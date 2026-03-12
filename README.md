# BeemSpec

BeemSpec is the planning layer for AI-native software teams. It connects product planning directly to AI coding agents via MCP, so your team can go from story to working code without manual handoff.

## The problem

Product teams spend significant effort translating plans into work that developers (or AI agents) can act on. User stories live in one tool, tasks in another, and context is lost at every handoff. When AI coding agents enter the picture, the gap gets worse -- they need structured, complete context to produce good output, and most planning tools weren't built to provide that.

## What BeemSpec does

BeemSpec is a **story mapping and release planning tool** with an **agent-ready MCP surface**. You plan your product visually, then agents fetch structured context directly from BeemSpec through MCP tools.

### Plan visually with story maps

Lay out your product as a story map -- a grid where columns represent user activities and tasks, and rows represent releases. Drop stories into the grid to define what ships when. Each story captures a user story, acceptance criteria, design links, edge cases, and technical guidelines in structured fields that both humans and AI agents can consume.

### Build with AI agents

Use the Agent Kickoff panel to copy a starter prompt, paste it into your coding agent, and have the agent pull the latest planning and implementation context via MCP. Agents use `storymap_get` for whole-map or release planning and `story_context_get` only for the specific story being implemented. This keeps execution local to the developer's agent while BeemSpec stays the shared planning source of truth.

### Stay in sync with Linear

BeemSpec syncs bidirectionally with [Linear](https://linear.app). Stories created or updated in BeemSpec automatically appear as Linear issues, and changes in Linear flow back. Your planning stays in BeemSpec, your execution tracking stays in Linear, and they never drift apart.

## How the three systems work together

| System | Role | Owns |
|---|---|---|
| **BeemSpec** | Planning source of truth | *What* to build and *why* |
| **Linear** | Execution coordination | *When* and *who* |
| **Coding agent** | Local execution runtime | *How* (the code) |

BeemSpec sits at the top of this stack. It syncs planning state to Linear and exposes MCP tools so any compatible coding agent can fetch context and report progress/blockers.

## Key capabilities

- **Story map management**: activities, tasks, stories, and release slicing with full drag-and-drop
- **Structured story specs**: user story, acceptance criteria, design links, edge cases, and technical notes
- **Agent kickoff prompts**: copy a release-targeted starter prompt that instructs agents to fetch current context through MCP
- **Linear integration**: bidirectional sync with OAuth, webhook ingestion, and batch backfill for drift correction
- **Team collaboration**: authentication, team switching, member invites, role-based access
- **MCP server**: exposes end-to-end story map management tools (maps, activities, tasks, releases, stories, personas) plus story context and blocker reporting for coding agents

## Tech stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS, Radix UI, dnd-kit
- **Backend**: Next.js API Routes, Supabase (PostgreSQL + Auth), row-level security
- **Integrations**: Linear SDK, MCP SDK
- **Tooling**: Biome (lint/format), Vitest (testing)

## Documentation

- `docs/mcp-api-capability-matrix.md`: MCP vs REST API coverage, recommended agent flows, and safety boundaries
