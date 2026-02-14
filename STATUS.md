# STATUS.md

Last updated: 2026-02-14

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
- Route creates run + run items, syncs release stories to Linear, and finalizes run with deterministic status counts.

Tests added:

- `src/app/api/releases/[id]/build/route.test.ts`

## Notes

- `src/lib/http.ts` is still active and retained.
- Removed legacy route-guard helper remains removed (`src/lib/route-guards.ts`).

## Next Steps (Ordered)

1. Add `GET /api/releases/:id/build` (or run-history endpoint) for release run visibility in UI.
2. Add release-run retry semantics (resume failed items without duplicating successful ones).
3. Hook scheduled cron on main machine to `scripts/reconcile-linear-batch.sh` and monitor error rates.
