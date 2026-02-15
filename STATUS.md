# STATUS.md

Last updated: 2026-02-15

## Snapshot

- Current milestone focus: Phase 3 hardening complete and Phase 4 foundation started.
- Current code health: `npm test`, `npm run lint`, and `npm run build` passing on latest changes.
- Integration posture: contract-first, feature-flagged runtime, official Linear SDK adapter, and story-link persistence scaffolded.

## Plan Progress

### Phase 1 - Story Map Hardening

Status: Complete.

Artifacts:

- `docs/phase1-bug-bash-2026-02-13.md`

### Phase 2 - Repo Architecture Alignment

Status: Complete.

Completed:

- Domain runtime boundaries and auth entrypoints are in place.
- Integration contracts/stubs are in place for Linear/OpenCode/release-runner.
- ADR set added for source-of-truth, runtime topology, and retry/idempotency policy.

### Phase 3 - Linear Sync Foundation

Status: Functionally complete; hardening in progress.

Completed so far:

- Official SDK-backed Linear issue adapter (`@linear/sdk`) for `issue`, `createIssue`, and `updateIssue`.
- Feature-flagged runtime wiring behind `BEEMSPEC_ENABLE_LINEAR`.
- Retry behavior for retryable Linear failures (rate-limit/network/5xx class).
- Story create route outbound sync call site with canonical story->Linear field mapping.
- Consolidated integration foundation migration: `supabase/migrations/003_story_linear_links.sql` (story links + team settings + webhook receipts).
- New story-link helper module: `src/integrations/linear/story-links.ts`.
- New settings resolver module with DB-backed target resolution: `src/integrations/linear/settings.ts`.
- Team settings API added for in-app management:
  - `GET /api/teams/:id/integrations/linear`
  - `PUT /api/teams/:id/integrations/linear`
- Inbound Linear webhook route added with signature verification and idempotent receipt persistence:
  - `src/app/api/integrations/linear/webhook/route.ts`
  - `src/integrations/linear/webhook-verifier.ts`
  - `supabase/migrations/003_story_linear_links.sql`
- Inbound conflict policy now uses code-defined latest-write-wins (newer update timestamp wins across BeemSpec/Linear).
- Manual reconciliation endpoint added for forced convergence on demand:
  - `POST /api/integrations/linear/reconcile`
  - `src/app/api/integrations/linear/reconcile/route.ts`
- Batch reconciliation endpoint added for periodic drift correction:
  - `POST /api/integrations/linear/reconcile/batch`
  - `src/app/api/integrations/linear/reconcile/batch/route.ts`
- Shared reconciliation logic extracted to avoid route-level duplication:
  - `src/integrations/linear/reconcile.ts`
- Ops visibility endpoints added:
  - `GET /api/integrations/linear/ops/failed-webhooks`
  - `GET /api/integrations/linear/ops/reconcile-failures`
- Cron-friendly auth added for batch reconciliation (`BEEMSPEC_RECONCILE_CRON_TOKEN`) and helper script added:
  - `scripts/reconcile-linear-batch.sh`
- Story update route now syncs outbound too:
  - uses existing link to `updateIssue` when present
  - creates issue + link if a link does not exist

Tests added/updated:

- `src/integrations/linear/story-sync.test.ts`
- `src/integrations/linear/story-links.test.ts`
- `src/integrations/linear/settings.test.ts`
- `src/app/api/teams/[id]/integrations/linear/route.test.ts`
- `src/integrations/linear/webhook-verifier.test.ts`
- `src/app/api/integrations/linear/webhook/route.test.ts`
- `src/app/api/integrations/linear/reconcile/route.test.ts`
- `src/app/api/integrations/linear/reconcile/batch/route.test.ts`
- `src/integrations/linear/reconcile.test.ts`
- `src/app/api/integrations/linear/ops/failed-webhooks/route.test.ts`
- `src/app/api/integrations/linear/ops/reconcile-failures/route.test.ts`
- `src/app/api/story-map-routes.test.ts`

### Phase 4 - Build Release Orchestrator

Status: Started (foundation slice).

Completed so far:

- Added release run schema foundation migration:
  - `supabase/migrations/004_release_runs.sql`
- Added release build API route:
  - `POST /api/releases/:id/build`
  - `src/app/api/releases/[id]/build/route.ts`
- Added release run visibility/read endpoints:
  - `GET /api/releases/:id/runs`
  - `GET /api/releases/:id/story-states`
  - `GET /api/release-runs/:id`
- Added release run retry endpoint for failed items:
  - `POST /api/release-runs/:id/retry`
- Route creates run + run items, syncs release stories to Linear, and finalizes run with deterministic status counts.
- Added story-map UI release-runs panel with release-scoped run history + detail drill-in:
  - uses `GET /api/releases/:id/runs`
  - uses `GET /api/release-runs/:id`
- Added in-UI release build trigger and failed-item retry controls:
  - uses `POST /api/releases/:id/build`
  - uses `POST /api/release-runs/:id/retry`
- Added retry diagnostics fields for release run items:
  - migration: `supabase/migrations/004_release_runs.sql` (consolidated)
  - fields: `retry_count`, `last_retry_at`
- Added OpenCode session linkage for release run items:
  - migration: `supabase/migrations/004_release_runs.sql` (consolidated)
  - fields: `opencode_session_id`, `opencode_session_url`
- Build/retry orchestration now starts OpenCode sessions when `BEEMSPEC_ENABLE_OPENCODE` is enabled:
  - session linkage persisted into `release_run_items`
- Release-runs history API now supports status filter and offset pagination:
  - `GET /api/releases/:id/runs?limit=20&offset=0&status=failed`
- Story-map release-runs panel now supports status filters and next/previous pagination.
- Added single-story build route to run full Linear+OpenCode orchestration for one story:
  - `POST /api/stories/:id/build`

### Phase 5 - `opencode-beemspec` Plugin Package

Status: Functionally implemented.

Completed so far:

- Added package implementation at `packages/opencode-beemspec`.
- Added contract + implementation surface for hooks/events/tools:
  - `experimental.session.compacting`
  - `experimental.chat.system.transform`
  - `session.created | session.updated | session.idle | session.error`
  - `beemspec_story` and `beemspec_blocked`
- Added network-backed tool adapters to call BeemSpec API (`/api/opencode/story/:id`, `/api/opencode/blocked`).
- Added official OpenCode runtime SDK integration (`@opencode-ai/sdk`) for session create/get + context injection.
- Added plugin runtime module (`opencode-beemspec/runtime`) with official `@opencode-ai/plugin` hooks/tools.

### Phase 6 - Closed-Loop Execution UX

Status: In progress.

Completed so far:

- Release run detail now includes deep links:
  - story -> Linear issue
  - story -> OpenCode session
- Added manual controls in release run detail:
  - per-story build (`POST /api/stories/:id/build`)
  - per-story re-sync (`POST /api/stories/:id/sync-linear`)
  - mark blocked with reason (`POST /api/opencode/blocked`)
- Added simple operator docs:
  - `docs/setup-and-usage.md`
  - `docs/system-flow.md`
  - `docs/opencode-runtime-rollout.md`

### Durable Queue (Release Worker)

Status: Implemented.

Completed so far:

- Added durable orchestration job table:
  - `supabase/migrations/005_orchestration_jobs.sql`
- Release build now enqueues `release_build` jobs and dispatches inline opportunistically.
- Added dispatch API for queued job processing:
  - `POST /api/orchestration/jobs/dispatch`
  - optional machine token: `BEEMSPEC_RELEASE_WORKER_TOKEN`

Tests added:

- `src/app/api/releases/[id]/build/route.test.ts`
- `src/app/api/releases/[id]/runs/route.test.ts`
- `src/app/api/release-runs/[id]/retry/route.test.ts`

## Notes

- `src/lib/http.ts` is still active and retained.
- Removed legacy route-guard helper remains removed (`src/lib/route-guards.ts`).

## Next Steps (Ordered)

1. Hook scheduled cron on main machine to `scripts/reconcile-linear-batch.sh` and monitor error rates.
2. Publish/install `opencode-beemspec` package in real OpenCode runtime environments and verify load via `opencode.json`.
3. Add release dashboard aggregation for per-story latest session/run state across multiple runs.
