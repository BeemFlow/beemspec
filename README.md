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
- OpenCode: implementation runtime - session orchestration is implemented through the official SDK.

Near-term focus is hardening and polishing the Story Map experience for daily dogfooding before building integrations.

## Integration feature flags

- `BEEMSPEC_ENABLE_LINEAR`: enables Linear integration.
- `BEEMSPEC_ENABLE_OPENCODE`: enables OpenCode plugin/runtime integration.

Linear outbound sync requires an API key:

- `LINEAR_API_KEY` (preferred)
- `BEEMSPEC_LINEAR_API_KEY` (fallback)

Story-triggered outbound sync target is loaded from team integration settings (`integration_settings` table).

Current management API for team settings:

- `GET /api/teams/:id/integrations/linear`
- `PUT /api/teams/:id/integrations/linear`

Inbound sync uses a code-defined latest-write-wins policy (newer `updated_at` wins) to keep both systems convergent.

Manual reconciliation endpoint:

- `POST /api/integrations/linear/reconcile`
- body: `{ "story_id": "<uuid>" }`

Batch reconciliation endpoint (for lightweight periodic drift correction):

- `POST /api/integrations/linear/reconcile/batch`
- body: `{ "limit": 25, "older_than_minutes": 30 }` (both optional)

Ops visibility endpoints:

- `GET /api/integrations/linear/ops/failed-webhooks?limit=50`
- `GET /api/integrations/linear/ops/reconcile-failures?limit=50`

Batch reconciliation supports machine-trigger auth token:

- `BEEMSPEC_RECONCILE_CRON_TOKEN`
- call with `Authorization: Bearer <token>`

Cron setup guide:

- `docs/reconcile-cron.md`

Release build orchestration foundation:

- `POST /api/releases/:id/build`
- `GET /api/releases/:id/runs` (supports `limit`, `offset`, optional `status`)
- `GET /api/releases/:id/story-states` (latest run state per story)
- `GET /api/build-runs/:id`
- `POST /api/build-runs/:id/retry`
- `POST /api/stories/:id/build` (single-story build)
- `POST /api/stories/:id/build?build_run_id=:id` (append story to existing build run/session)
- `POST /api/stories/:id/sync-linear` (manual per-story Linear sync)
- `POST /api/orchestration/jobs/dispatch` (durable queue worker dispatch)

Terminology:

- `build_runs` = user-visible build attempts and outcomes
- `orchestration_jobs` = internal durable worker queue records that execute those runs

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

OpenCode plugin tool endpoints (token or authenticated user):

- `GET /api/opencode/story/:id`
- `POST /api/opencode/blocked`

Shared token for plugin-to-app calls:

- `BEEMSPEC_OPENCODE_TOKEN`

Optional worker token for orchestration dispatch endpoint:

- `BEEMSPEC_RELEASE_WORKER_TOKEN`

OpenCode plugin package is implemented at `packages/opencode-beemspec` with hook + custom-tool support.

Quick docs:

- Setup + usage: `docs/setup-and-usage.md`
- System flow: `docs/system-flow.md`
- OpenCode runtime rollout: `docs/opencode-runtime-rollout.md`
- Codebase map: `docs/codebase-map.md`

Inbound webhook sync requires a webhook signing secret:

- `BEEMSPEC_LINEAR_WEBHOOK_SECRET` (preferred)
- `LINEAR_WEBHOOK_SECRET` (fallback)

Webhook endpoint:

- `POST /api/integrations/linear/webhook`

Implementation note: Linear outbound integration uses the official SDK (`@linear/sdk`) for issue read/create/update operations.
