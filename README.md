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
- OpenCode: implementation runtime - planned, not yet implemented.

Near-term focus is hardening and polishing the Story Map experience for daily dogfooding before building integrations.

## Integration feature flags

- `BEEMSPEC_ENABLE_LINEAR`: enables Linear integration ports.
- `BEEMSPEC_ENABLE_OPENCODE`: enables OpenCode plugin/runtime ports.
- `BEEMSPEC_ENABLE_RELEASE_RUNNER`: enables release-runner orchestration port.

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

Helper script for local cron:

- `scripts/reconcile-linear-batch.sh`

Inbound webhook sync requires a webhook signing secret:

- `BEEMSPEC_LINEAR_WEBHOOK_SECRET` (preferred)
- `LINEAR_WEBHOOK_SECRET` (fallback)

Webhook endpoint:

- `POST /api/integrations/linear/webhook`

Implementation note: Linear outbound integration uses the official SDK (`@linear/sdk`) for issue read/create/update operations.
