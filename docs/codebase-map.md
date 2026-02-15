# Codebase Map

## Guiding organization style

- App-oriented modules for core workflows (`orchestration`, `runtime`, `integrations`).
- Small shared layers for cross-cutting concerns (`lib`).
- API routes stay thin and defer behavior to orchestration/domain modules.

## Main folders

- `src/orchestration/release-build`: release build execution pipeline (queue, run processor, linear sync processor, run records).
- `src/integrations/linear`: Linear API + webhook ingest + sync/reconcile helpers.
- `src/integrations/opencode`: OpenCode session runtime adapter.
- `src/app/api`: HTTP boundaries only.
- `src/runtime`: runtime dependency wiring.
- `src/lib`: auth, errors, validation, supabase clients, utility helpers.
- `src/components`: app and UI components.

## Release orchestration terminology

- `release_runs`: user-facing execution attempt (what happened for a release build request).
- `release_run_items`: per-story result rows for that run.
- `orchestration_jobs`: internal durable queue jobs that execute runs.

Short version: **run = business record**, **job = worker record**.

## Practical reading order

1. `docs/system-flow.md`
2. `src/orchestration/release-build/index.ts`
3. `src/app/api/releases/[id]/build/route.ts`
4. `src/orchestration/release-build/job-queue.ts`
5. `src/orchestration/release-build/run-processor.ts`
6. `src/orchestration/release-build/linear-sync-processor.ts`
