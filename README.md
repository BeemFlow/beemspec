# BeemSpec

BeemSpec is the planning layer for AI-native software teams. It connects product planning directly to AI coding agents, so your team can go from story to working code without manual handoff.

## The problem

Product teams spend significant effort translating plans into work that developers (or AI agents) can act on. Requirements live in one tool, tasks in another, and context is lost at every handoff. When AI coding agents enter the picture, the gap gets worse -- they need structured, complete context to produce good output, and most planning tools weren't built to provide that.

## What BeemSpec does

BeemSpec is a **story mapping and release planning tool** that doubles as an **AI build orchestrator**. You plan your product visually, then BeemSpec feeds that context directly to an AI coding agent to start building.

### Plan visually with story maps

Lay out your product as a story map -- a grid where columns represent user activities and tasks, and rows represent releases. Drop stories into the grid to define what ships when. Each story captures requirements, acceptance criteria, design links, edge cases, and technical guidelines in structured fields that both humans and AI agents can consume.

### Build with AI agents

Click "Build Release" and BeemSpec creates an AI coding session (powered by [OpenCode](https://opencode.ai)), seeds it with full story context, and instructs the agent to start implementing. Track build progress per story, retry failures, and link back to the AI session -- all from the story map UI.

### Stay in sync with Linear

BeemSpec syncs bidirectionally with [Linear](https://linear.app). Stories created or updated in BeemSpec automatically appear as Linear issues, and changes in Linear flow back. Your planning stays in BeemSpec, your execution tracking stays in Linear, and they never drift apart.

## How the three systems work together

| System | Role | Owns |
|---|---|---|
| **BeemSpec** | Planning source of truth | *What* to build and *why* |
| **Linear** | Execution coordination | *When* and *who* |
| **OpenCode** | AI implementation runtime | *How* (the code) |

BeemSpec sits at the top of this stack. It pushes structured context downstream -- to Linear for tracking, and to OpenCode for implementation. AI agents can also call back into BeemSpec during a coding session (via MCP tools) to fetch story details or report blockers.

## Key capabilities

- **Story map management**: activities, tasks, stories, and release slicing with full drag-and-drop
- **Structured story specs**: requirements, acceptance criteria, design links, edge cases, and technical notes
- **Build runs**: trigger AI coding sessions for an entire release or a single story, monitor progress, retry failures
- **Linear integration**: bidirectional sync with OAuth, webhook ingestion, and batch backfill for drift correction
- **OpenCode integration**: session creation, context seeding, MCP server for agent-to-app communication
- **Team collaboration**: authentication, team switching, member invites, role-based access
- **MCP server**: exposes end-to-end story map management tools (maps, activities, tasks, releases, stories, personas) plus story context and blocker reporting for coding agents

## Tech stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS, Radix UI, dnd-kit
- **Backend**: Next.js API Routes, Supabase (PostgreSQL + Auth), row-level security
- **Integrations**: Linear SDK, OpenCode SDK, MCP SDK
- **Tooling**: Biome (lint/format), Vitest (testing)

## Documentation

Detailed docs live in the `docs/` directory:

- `docs/setup-and-usage.md`: setup and usage guide
- `docs/system-flow.md`: end-to-end system flow
- `docs/opencode-runtime-rollout.md`: OpenCode runtime integration details
- `docs/codebase-map.md`: codebase architecture and reading guide
- `docs/sync-cron.md`: Linear sync cron setup
- `docs/mcp-storymap-demo.md`: MCP setup and story map management demo flow
