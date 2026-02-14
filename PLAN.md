# PLAN.md - BeemSpec Execution Plan

## North Star

BeemSpec is the planning source of truth (`what` + `why`), Linear is execution coordination, and OpenCode is implementation runtime.
"Build Release" turns planned stories into active implementation sessions with preserved release context.

## Current State (What We Already Have)

- Multi-team auth + permissions with Supabase and RLS.
- Story map data model and CRUD for:
  - Story maps
  - Activities
  - Tasks
  - Stories
  - Releases
- Drag-and-drop story map UI with release/backlog slicing.
- Team settings with member invites/removal.

## Gaps vs Target Architecture

- No Linear integration (sync, mappings, webhooks, conflict handling).
- No Build Release orchestration in app backend.
- No OpenCode plugin package (`opencode-beemspec`) or lifecycle hooks.
- No agent context packaging pipeline (story + release scope payload).
- No tests around critical orchestration paths.

## Guiding Implementation Principles

- Keep BeemSpec as product-planning source of truth.
- Keep Linear as execution layer; avoid duplicating sprint/issue workflow in BeemSpec.
- Keep OpenCode-native responsibilities in OpenCode; use thin glue code/plugin.
- Prefer official provider SDKs over hand-rolled HTTP clients when the SDK is stable and covers required operations.
- Preserve existing Next.js + Supabase foundation.
- Ship in vertical slices with observable outcomes, not broad scaffolding.

## Locked Decisions

- Stack: keep current Next.js + Supabase stack.
- Runtime: run BeemSpec on your main machine as a long-running Next.js app.
- Notifications: defer all push/desktop/telegram notifications until after core orchestration is stable.
- Sequencing: finish and polish story-map product surface before starting Linear/OpenCode integration build.
- DB scope now: no non-story-map schema migrations until story-map hardening exit criteria are met.
- Personas: defer from active Story Map UI flow for now; revisit after dogfooding feedback confirms need.

## Delivery Strategy (Story-Map First)

- Gate 1 (now): Story-map hardening and polish only.
- Gate 2: integration-ready architecture alignment (repo/package boundaries, interfaces, ADRs).
- Gate 3: Linear sync + Build Release orchestration implementation.
- Rule: architecture docs and code organization can advance now; integration tables/jobs/migrations stay deferred.

## Hosting and Execution Model (Main Machine)

- App process: Next.js app (`next start`) is the control plane and API surface.
- Data plane: Supabase remains source of truth for state, history, and run tracking.
- Orchestration model (deferred until Gate 3): durable DB-backed job runner, triggered by API routes and processed via a local worker loop.
- Worker placement (recommended): in-app background worker started with app boot on your machine.
- Reliability model: at-least-once job execution with idempotent handlers and retry/backoff.
- Recovery model: worker restart resumes pending jobs from DB without manual intervention.

## Phase Plan

## Phase 1 - Harden Existing Story Map Core (Primary Focus) (1-2 weeks)

- Add smoke tests for critical map operations (create/edit/reorder/move/delete).
- Add API contract tests for story/task/release reorder and movement.
- Improve map UX polish:
  - loading/error states
  - drag/drop failure handling and user feedback
  - mobile usability pass
- Expose personas in UI or explicitly defer/remove from active model.
- Update README to reflect implemented reality and near-term sequencing.
- Resolve remaining map-specific bugs before integration work starts.

Exit criteria:
- Story-map workflows are stable, polished, and test-backed.
- No P1/P2 bugs open in core map interactions.
- Team signs off that story mapping is ready for integration phase.

### Phase 1 Punch-List (Execution Backlog)

- Test foundation
  - Add unit tests for validation helpers (`src/lib/validations.ts`) and error helpers (`src/lib/errors.ts`).
  - Add API route tests for create/update/delete/reorder on activities, tasks, stories, releases.
  - Add integration test for drag/drop move flows: same-lane reorder and cross-lane move.
- Story map UX polish
  - Add clear inline error states when reorder/move requests fail.
  - Add loading/disabled states for dialog saves/deletes to prevent duplicate submits.
  - Improve mobile interaction pass for map canvas and dialogs (touch drag tolerance, scroll/overflow behavior).
  - Add empty and recovery states for story-map detail page (`src/app/(authenticated)/story-map/[id]/page.tsx`).
- Data and behavior hardening
  - Audit all map mutations for partial-failure risk; add compensating refresh and user-visible error messaging.
  - Standardize optimistic vs non-optimistic behavior (choose one per interaction and document it).
  - Verify release delete semantics are explicit and safe (stories deleted by cascade is intentional and clearly communicated).
- Product completeness
  - Decide personas path now: implement minimum UI surface or explicitly hide/defer from user flow.
  - Update README and in-app copy to match current capabilities and near-term roadmap.
- Bug bash and acceptance
  - Run a focused bug bash on: create/edit/delete, drag/drop, release slicing, team switching, auth/session edge cases.
  - Track and resolve all P1/P2 issues before phase signoff.

### Dogfooding Readiness Criteria (Go/No-Go)

- Map creation, editing, and release slicing feel reliable in daily use.
- No blocking UX defects in drag/drop or dialog workflows on desktop and mobile.
- Error paths are understandable (user knows what failed and what to do next).
- Core flows are covered by repeatable tests and pass locally.
- README reflects actual behavior so team usage expectations are accurate.

### Dogfooding Protocol (Immediately After Phase 1)

- Use BeemSpec as the single planning board for active work (no parallel planning doc for day-to-day changes).
- Capture at least one real release slice end-to-end in the map each week.
- Keep a short "dogfood findings" log (friction, missing fields, confusing interactions) and triage weekly.
- Convert recurring friction into prioritized product tasks before beginning deeper integrations.

## Phase 2 - Repo Architecture Alignment (No Integration Migrations) (1-2 days)

- Keep existing stack and align repository for future integration without changing integration schema.
- Define package/module boundaries now:
  - app domains (`story-map`, `teams`, `auth`)
  - integration contracts (`linear`, `opencode`) as interfaces/stubs only
  - orchestration boundary (`release-runner`) as interface only
- Add ADRs and docs:
  - source-of-truth matrix (BeemSpec vs Linear vs OpenCode)
  - local runtime topology on main machine
  - idempotency and retry policy (design only)
- Add placeholder service interfaces in code where useful, but no external integration calls yet.

Exit criteria:
- Repo structure and architecture docs are integration-ready without introducing non-story-map DB changes.

### Phase 2 Exit Checklist

- [x] Domain boundaries established for `story-map`, `teams`, and `auth`.
- [x] Integration contracts and stubs added for Linear and OpenCode (no live external calls).
- [x] Orchestration contract and stub added for release runner (no DB/job migrations yet).
- [x] ADRs added for source-of-truth, runtime topology, and idempotency/retry design.
- [x] Story-map and team API routes use domain runtime auth entrypoint consistently.
- [x] No non-story-map schema migrations added in this phase.

## Phase 3 - Linear Sync Foundation (4-6 days)

- Add integration settings (per team/story map):
  - Linear workspace/team/project IDs
  - status mapping
  - optional assignee/label defaults
- Extend schema with mapping tables:
  - `story_linear_links` (story_id <-> linear_issue_id)
  - sync metadata (`last_synced_at`, `sync_state`, `sync_error`)
- Implement outbound sync:
  - create/update Linear issue from story changes
- Implement inbound sync:
  - Linear webhook endpoint for status/title updates back to stories
- Add idempotency and conflict strategy (BeemSpec fields authoritative vs mirrored fields).

Exit criteria:
- Bi-directional story<->issue sync works for create/update/status.

### Phase 3 Slice 1 Definition of Done (Outbound Only)

- Outbound adapter uses the official Linear TypeScript SDK (`@linear/sdk`) for create/update/read issue operations.
- Adapter stays behind `BEEMSPEC_ENABLE_LINEAR`; disabled mode performs no external calls.
- Idempotent retry behavior is implemented in-process per ADR 0003 (bounded retries, backoff, safe re-entry).
- Contract tests cover SDK call shape, retry behavior, and field mapping using provider-documented model fields only.
- No webhook write-back or inbound sync changes in this slice.
- No new DB schema migrations required for this slice.

## Phase 4 - Build Release Orchestrator in BeemSpec (4-6 days)

- Add "Build Release" action in release UI.
- Implement release run model:
  - `release_runs`
  - `release_run_items` (story/issue/session linkage)
- Build execution pipeline:
  1. Collect stories in release
  2. Ensure Linear issue links exist
  3. Create OpenCode session per issue
  4. Inject story context + release scope payload
  5. Persist run/session state for tracking
- Add retry-safe orchestration semantics and visible run states.

Exit criteria:
- One button reliably starts sessions for all release stories.

## Phase 5 - `opencode-beemspec` Plugin Package (3-5 days)

- Create package `packages/opencode-beemspec`.
- Implement hooks:
  - `experimental.session.compacting`
  - `experimental.chat.system.transform`
  - `event` lifecycle handlers
- Implement tools:
  - `beemspec_story`
  - `beemspec_blocked`

Exit criteria:
- Session compaction preserves story/release context and plugin tools are callable from agent sessions.

## Phase 6 - Closed-Loop Execution UX (3-4 days)

- Story map release dashboard:
  - per-story session state
  - synced Linear status
  - blocked/error indicators
- Add deep links:
  - story <-> Linear issue
  - story <-> OpenCode session/web review
- Add manual controls:
  - re-sync story
  - retry session
  - mark blocked with reason

Exit criteria:
- PM can plan, trigger, and monitor a release entirely from BeemSpec.

## Phase 7 - Production Readiness (3-5 days)

- Add integration/e2e tests for release orchestration.
- Add observability:
  - request IDs
  - run IDs
  - failure reason taxonomy
- Security review:
  - webhook signature validation
  - token/secret storage strategy
  - scoped service credentials
- Publish plugin package and document install/config flow.

Exit criteria:
- Workflow is reliable, observable, and safe for daily use.

## Data Model Additions (Planned)

- `integration_settings` (team-level)
- `story_linear_links`
- `release_runs`
- `release_run_items`
- `orchestration_jobs`

Note: only story-map-related schema changes are in scope before Phase 1 signoff.

## Open Decisions

- Exact worker startup mechanism on local machine:
  - managed inside app process, or
  - sidecar Node worker launched alongside `next start`.
- Initial concurrency and retry limits for your machine profile.
- Timing for introducing notifications after core orchestration GA.

## Milestone View

- M1: Story Map Core Stable and Polished
- M2: Repo Architecture Integration-Ready
- M3: Linear Sync Live
- M4: Build Release Launches Sessions
- M5: Plugin Preserves Context
- M6: End-to-End PM-to-Agent Workflow
