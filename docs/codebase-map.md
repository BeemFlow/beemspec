# Codebase Map

## Guiding organization style

- Keep core flow logic in a few direct modules (`build-runs`, `integrations`).
- Keep shared helpers in `lib`.
- Keep API routes thin and call into those modules.

## Main folders

- `src/build-runs`: queue + processing logic for build runs and story linear sync jobs.
- `src/integrations/linear`: Linear API + webhook ingest + sync helpers.
- `src/integrations/opencode`: OpenCode session runtime adapter.
- `src/app/api`: HTTP boundaries only.
- `src/lib`: auth, errors, validation, supabase clients, utility helpers.
- `src/components`: app and UI components.

## Build run terminology

- `build_runs`: user-facing execution attempt (what happened for a build request).
- `build_run_items`: per-story result rows for that run.
- `worker_jobs`: internal durable queue jobs that execute runs.

Short version: **run = business record**, **job = worker record**.

## Practical reading order

1. `docs/system-flow.md`
2. `src/build-runs/queue.ts`
3. `src/app/api/releases/[id]/build/route.ts`
4. `src/build-runs/processor.ts`
