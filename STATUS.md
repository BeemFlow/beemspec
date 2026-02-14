# STATUS.md

Last updated: 2026-02-13

## Snapshot

- Current milestone focus: Phase 3 slice 1 started (Linear outbound sync foundation).
- Current code health: `test`, `lint`, and `build` all passing on latest changes.
- Integration posture: contract-first, feature-flagged runtime with Linear outbound adapter implemented behind flag.

## Plan Progress

### Phase 1 - Story Map Hardening

Status: Complete for technical exit; signoff artifact recorded.

Completed:

- Story map UX hardening and error/loading improvements.
- Core route and behavior tests for story map and team flows.
- Personas explicitly deferred from active UI flow.
- README and planning docs aligned to current scope.

Closure artifacts:

- Bug bash record added: `docs/phase1-bug-bash-2026-02-13.md`.
- Explicit no-open P1/P2 statement captured in bug bash record.
- Phase 1 signoff note captured as "technical exit complete, ready for team confirmation".

### Phase 2 - Repo Architecture Alignment

Status: Complete.

Completed:

- Integration contract document: `INTEGRATION_CONTRACTS.md`.
- ADRs added for source-of-truth, local runtime topology, idempotency/retry policy.
- Interface boundaries added:
  - `src/integrations/linear/contracts.ts`
  - `src/integrations/opencode/contracts.ts`
  - `src/orchestration/release-runner/contracts.ts`
- Domain runtime boundaries added:
  - `src/domains/auth/index.ts`
  - `src/domains/story-map/index.ts`
  - `src/domains/teams/index.ts`
  - `src/domains/runtime.ts`
- Domain runtime auth entrypoint adopted across story-map API routes.
- Feature-flagged stubs added and covered by contract-shape tests.

Closure artifacts:

- Added and completed Phase 2 exit checklist in `PLAN.md`.
- Team nested route family now uses domain runtime auth entrypoint consistently.

### Phase 3+ - Not started

- No integration DB migrations or inbound sync/orchestration behavior implemented yet.

### Phase 3 - Slice 1 (Outbound Foundation)

Status: In progress.

Completed:

- Added a feature-flagged Linear issue sync adapter behind `BEEMSPEC_ENABLE_LINEAR`.
- Re-architected adapter to use official Linear SDK (`@linear/sdk`) for outbound/lookup surface:
  - `createIssue(input)`
  - `updateIssue(id, input)`
  - `issue(id)`
- Added retry handling for SDK retryable failures (`RatelimitedLinearError`, `NetworkLinearError`, HTTP 429/5xx).
- Added contract tests for SDK call shape, retry behavior, and missing API key handling.
- Wired first story-triggered outbound sync call site on story create route.
- Added canonical story -> Linear mapping module (`src/integrations/linear/story-sync.ts`).
- Removed unused legacy helpers (`src/lib/route-guards.ts`, `src/lib/http.ts`) and their orphaned tests.

Still needed:

- Extend outbound sync beyond story creation once mapping links (`story_linear_links`) are available.

## Complexity Audit

Audit goal: keep Phase 2 practical and avoid accidental overengineering.

Findings:

- Good: boundaries are thin and readable; no heavy DI framework or speculative generic layers.
- Good: feature flags keep runtime behavior explicit and safe.
- Good: stubs are minimal and test-backed.
- Remaining risk to watch: keep new integration code on contract boundaries and avoid leaking provider-specific payloads into route handlers.

## Integration SDK Audit

- Linear: official SDK available and now adopted in runtime (`@linear/sdk`).
- OpenCode: official plugin SDK/tooling already part of architecture (`@opencode-ai/plugin` surface in contract docs).
- Release runner: internal BeemSpec orchestration boundary; no external provider SDK required.

Action taken:

- Simplified Linear webhook stub by removing an unnecessary custom error class and using direct error construction.
- Removed auth-entrypoint split in team nested routes by migrating to `domainRuntime.teams.auth.requireAuth()`.

Keep-as-is decision:

- Keep current domain runtime + contracts + stub structure. It adds limited indirection with clear payoff for upcoming integration work.

## Next Steps (Ordered)

1. Start Phase 3 slice 1 (Linear outbound sync only, no webhook write-back yet):
   - implement adapter using official Linear SDK operations
   - keep all calls behind `BEEMSPEC_ENABLE_LINEAR`
   - add contract tests using documented SDK model fields only
2. Implement idempotent retry behavior for outbound sync from ADR 0003 (in-process design, no durable job table yet).
3. Wire a first story-driven call site to outbound Linear adapter with explicit field mapping policy.
