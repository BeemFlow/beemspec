# BeemSpec

BeemSpec is a story-mapping and release-planning tool. It is currently focused on helping teams define product scope clearly before execution.

## Current product scope

- Story map management with activities, tasks, stories, and release slicing.
- Team-based collaboration with authentication, team switching, and member invites.
- Drag-and-drop map interactions for reordering and moving work across the board.
- Story detail capture for requirements, acceptance criteria, design links, edge cases, and technical notes.
- Personas are intentionally deferred from the active UI flow until post-hardening product validation.

## Product direction

BeemSpec is being built as the planning source of truth.

- BeemSpec: planning context (`what` and `why`).
- Linear: execution coordination (`when` and `who`) - story sync foundation implemented.
- OpenCode: implementation runtime - session management is implemented through the official SDK.

Near-term focus is hardening and polishing the Story Map experience for daily dogfooding before building integrations.

Linear outbound sync now supports team-scoped OAuth 2.0 (recommended) and API key fallback:

- OAuth env:
  - `LINEAR_CLIENT_ID`
  - `LINEAR_CLIENT_SECRET`
  - `LINEAR_OAUTH_REDIRECT_URI`
- Optional fallback:
  - `LINEAR_API_KEY`

Story-triggered outbound sync target is loaded from team integration settings (`integration_settings` table).

Current management API for team settings:

- `GET /api/teams/:id/integrations/linear`
- `PUT /api/teams/:id/integrations/linear`

Linear OAuth connect API:

- `GET /api/integrations/linear/oauth/start?team_id=:id&return_to=/:path`
- `GET /api/integrations/linear/oauth/callback`
- `GET /api/integrations/linear/oauth/connection?team_id=:id`
- `DELETE /api/integrations/linear/oauth/connection?team_id=:id`

Inbound sync uses a code-defined latest-write-wins policy (newer `updated_at` wins) to keep both systems convergent.

Manual sync backfill endpoint:

- `POST /api/integrations/linear/sync`
- body: `{ "story_id": "<uuid>" }`

Batch sync backfill endpoint (for lightweight periodic drift correction):

- `POST /api/integrations/linear/sync/batch`
- body: `{ "limit": 25, "older_than_minutes": 30 }` (both optional for stale-link selection)
- optional targeted body: `{ "story_ids": ["<uuid>", "<uuid>"] }` (sync exactly these stories)

Batch sync supports machine-trigger auth token:

- `BEEMSPEC_SYNC_CRON_TOKEN`
- call with `Authorization: Bearer <token>`

Cron setup guide:

- `docs/sync-cron.md`

Build-run API foundation:

- `POST /api/releases/:id/build`
- `GET /api/releases/:id/runs` (supports `limit`, `offset`, optional `status`)
- `GET /api/releases/:id/story-states` (latest run state per story)
- `GET /api/build-runs/:id`
- `POST /api/build-runs/:id/retry`
- `POST /api/stories/:id/build` (single-story build)
- `POST /api/stories/:id/build?build_run_id=:id` (append story to existing build run/session)
- `POST /api/stories/:id/sync-linear` (manual per-story Linear sync)
- `POST /api/build-runs/dispatch` (durable build-run queue dispatch)

Terminology:

- `build_runs` = user-visible build attempts and outcomes
- `worker_jobs` = internal durable queue records for build-run execution

Story map UI now includes a Build Runs panel for:

- selecting a release
- triggering `Build Release`
- viewing recent run history and item-level details
- retrying failed run items

Build run item diagnostics include `retry_count` and `last_retry_at` for retry observability.

Build run items also persist OpenCode session linkage (`opencode_session_id`, `opencode_session_url`) when OpenCode integration is enabled.

OpenCode runtime session integration uses the official SDK (`@opencode-ai/sdk`) against:

- `BEEMSPEC_OPENCODE_BASE_URL` (defaults to `http://127.0.0.1:4096`)
- optional `BEEMSPEC_OPENCODE_WEB_BASE_URL` for deep-link URL generation

OpenCode MCP endpoint:

- `POST /api/mcp`
- `GET /api/mcp`
- `DELETE /api/mcp`

Related OpenCode utility route:

- `POST /api/opencode/blocked`

Shared token for MCP server to app calls:

- `BEEMSPEC_OPENCODE_TOKEN`

Optional worker token for dispatch endpoint:

- `BEEMSPEC_WORKER_TOKEN`

OpenCode integration package is implemented at `packages/opencode-beemspec` for hook support. MCP tools are served from this Next app using the official MCP SDK.

Quick docs:

- Setup + usage: `docs/setup-and-usage.md`
- System flow: `docs/system-flow.md`
- OpenCode runtime rollout: `docs/opencode-runtime-rollout.md`
- Codebase map: `docs/codebase-map.md`

Inbound webhook sync requires a webhook signing secret:

- `BEEMSPEC_LINEAR_WEBHOOK_SECRET`

Webhook endpoint:

- `POST /api/integrations/linear/webhook`

Implementation note: Linear outbound integration uses the official SDK (`@linear/sdk`) for issue read/create/update operations.
