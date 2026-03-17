# MCP vs API Capability Matrix

This document describes what is exposed through the BeemSpec MCP server (`/api/mcp`) versus the REST API (`/api/*`), and where intentional differences exist.

## Positioning

- MCP is the agent-facing execution surface (tool-based, structured, low-friction for coding agents).
- REST API is the full app/integration/admin surface.
- The two surfaces share core service logic for most story-map mutations, but are not strict 1:1 parity by design.

## Capability Matrix

Legend:

- Yes: exposed
- No: not exposed
- Partial: available but not fully equivalent

| Capability | MCP (`/api/mcp` tools) | REST API (`/api/*`) | Notes |
|---|---|---|---|
| Team discovery | Yes (`team_list`) | Yes (`GET /api/teams`) | Both return teams accessible to authenticated user. |
| Story map list | Yes (`storymap_list`) | Yes (`GET /api/story-maps`) | Both require explicit `team_id` when user has multiple teams. |
| Story map get (structure + lightweight planning refs) | Yes (`storymap_get`) | Yes (`GET /api/story-maps/[id]`) | MCP now returns map context, backbone structure, releases, personas, planning lanes, and lightweight story refs; REST remains the heavier full graph route used by the app. |
| Release get | Yes (`release_get`) | No dedicated route | MCP-only release planning read with release context and lightweight story refs for one release. |
| Story map create | Yes (`storymap_create`) | Yes (`POST /api/story-maps`) | Near parity, including `context_markdown`. |
| Story map update | Yes (`storymap_update`) | Yes (`PUT /api/story-maps/[id]`) | Near parity, including `context_markdown`. |
| Story map delete | No | Yes (`DELETE /api/story-maps/[id]`) | Intentional safety gap: no map delete via MCP. |
| Activity create/update/reorder | Yes (`activity_create/update/reorder`) | Yes (`POST /api/activities`, `PUT /api/activities/[id]`, `PUT /api/activities`) | Parity. |
| Activity delete | Yes (`activity_delete`) | Yes (`DELETE /api/activities/[id]`) | Currently exposed in both. |
| Task create/update/reorder | Yes (`task_create/update/reorder`) | Yes (`POST /api/tasks`, `PUT /api/tasks/[id]`, `PUT /api/tasks`) | Parity. |
| Task move | Yes (`task_move`) | Yes (`PUT /api/tasks/[id]/move`) | Parity. |
| Task delete | Yes (`task_delete`) | Yes (`DELETE /api/tasks/[id]`) | Currently exposed in both. |
| Release create/update/reorder | Yes (`release_create/update/reorder`) | Yes (`POST /api/releases`, `PUT /api/releases/[id]`, `PUT /api/releases`) | Parity for writes, including `context_markdown`; MCP adds `release_get` as a read helper. |
| Release delete | Yes (`release_delete`) | Yes (`DELETE /api/releases/[id]`) | Currently exposed in both. |
| Story get/create/update/reorder | Yes (`story_get/create/update/reorder`) | Yes (`GET /api/stories/[id]`, `POST /api/stories`, `PUT /api/stories/[id]`, `PUT /api/stories`) | Parity. |
| Story move | Yes (`story_move`) | Yes (`PUT /api/stories/[id]/move`) | Parity. |
| Story delete | Yes (`story_delete`) | Yes (`DELETE /api/stories/[id]`) | Currently exposed in both. |
| Persona list/create/update | Yes (`persona_list/create/update`) | Partial (`POST /api/personas`, `PUT /api/personas/[id]`) | REST has no dedicated persona list route. |
| Persona delete | Yes (`persona_delete`) | Yes (`DELETE /api/personas/[id]`) | Parity. |
| Agent workflow guide | Yes (`storymap_workflow_guide`) | No | MCP-only agent helper. |
| Agent coding context | Yes (`story_context_get`) | No equivalent | MCP-only story implementation helper; now includes story map context markdown, release context markdown when present, workflow placement, personas, and Figma hints. |
| Team admin (members/invites/settings/delete team) | No | Yes (`/api/teams/[id]/*`) | API-only operational/admin surface. |
| Linear OAuth/webhook/sync management | No | Yes (`/api/integrations/linear/*`, `/api/story-maps/[id]/integrations/linear/*`) | API-only integration surface. |
| MCP OAuth endpoints | Transport/auth support | N/A | Uses Supabase OAuth server (`https://<project-ref>.supabase.co/auth/v1`) discovered via protected-resource metadata. Consent UI is app-hosted at `/oauth/consent` and submits decisions to `/oauth/decision`. |

## Multi-team Behavior

- Both MCP and REST support multi-team users.
- If user has one team, team resolution can be implicit in list flows.
- If user has multiple teams, callers must provide a `team_id`.
- MCP provides `team_list` as the first-step discovery tool for this case.

## Recommended End-to-End Flows

### MCP-first (coding agent)

1. Authenticate client (Bearer or MCP OAuth).
2. `team_list` (only when team is unknown / multi-team context).
3. `storymap_list`.
4. `storymap_get` for story map context, backbone structure, release list, and lightweight story refs.
5. `release_get` when release-level context or release-scope review is needed.
6. `story_context_get` only for the selected story being implemented or deeply refined.
7. If the story includes a Figma link and the agent session has Figma MCP connected, fetch Figma design context before UI implementation.
8. Mutate with focused tools (`story_update`, move/reorder/create as needed).
9. Re-read `storymap_get` only after a structural mutation batch or changed release-planning context.

### API-first (app/integration/backend)

1. Authenticate user/session.
2. Resolve team context (`GET /api/teams`, then team-specific routes as needed).
3. Manage story maps (`/api/story-maps`, `/api/story-maps/[id]`).
4. Manage entities (`/api/activities`, `/api/tasks`, `/api/releases`, `/api/stories`, `/api/personas`).
5. Use integration/admin routes as needed (Linear OAuth/sync/webhook, team members/invites/settings).

## Safety Policy

- Keep story map delete disabled on MCP to reduce accidental destructive actions by agents.
- Keep destructive operations that require stronger human intent on REST-only routes where applicable.
