# STATUS.md

Last updated: 2026-02-14

## Snapshot

- Current milestone focus: Phase 3 execution (outbound foundation, DB-backed settings, and inbound webhook foundation in place).
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

Status: In progress.

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
- Inbound conflict policy implemented with practical defaults:
  - title write-back disabled by default
  - status write-back enabled by default
  - team-configurable state mapping via `integration_settings.linear_status_mapping` (state name or state ID)
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
- `src/app/api/story-map-routes.test.ts`

## Notes

- `src/lib/http.ts` is still active and retained.
- Removed legacy route-guard helper remains removed (`src/lib/route-guards.ts`).

## Next Steps (Ordered)

1. Add explicit per-field source-of-truth tests for outbound vs inbound behavior (title/status) across update races.
2. Add UI surface in team settings page for webhook policy fields (`linear_allow_title_writeback`, status mapping JSON/editor).
3. Add optional mapping by Linear state ID (not just state name) for teams with duplicate state names.
