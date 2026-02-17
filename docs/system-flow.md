# System Flow

## Ownership model

- BeemSpec: planning source of truth (`what` and `why`)
- Linear: execution issue coordination
- OpenCode: coding runtime sessions

## Main release flow

1. User clicks **Build Release**.
2. BeemSpec reuses latest active run for the release when possible; otherwise creates a new `build_runs` row.
3. It enqueues `worker_jobs` for stories not yet present in the active run.
4. For each story:
   - ensures one OpenCode session exists for the run (`build_runs.opencode_session_id`)
   - reads existing `story_linear_links` mapping
   - writes `build_run_items` with issue + run session links
5. BeemSpec finalizes run status and counts.

If processing is interrupted, queued jobs can be resumed via `POST /api/build-runs/dispatch`.

### Run vs job

- `build_runs` is the user-visible record of a build attempt.
- `worker_jobs` is the worker queue envelope that executes that run durably.
- One run usually maps to one build-run job, but they are intentionally separate concerns.

## Single-story flow

1. User clicks **Build story**.
2. BeemSpec creates a one-item `build_runs` row.
3. Story sync + assignment runs for only that story.
4. Run and item are finalized and visible in Build Runs panel.

If `build_run_id` is provided, BeemSpec appends the story to that existing build run and reuses its session.

## Recovery/operations flow

- Retry failed items: `POST /api/build-runs/:id/retry`
- Manual per-story sync: `POST /api/stories/:id/sync-linear` (direct sync)
- Mark blocked: `POST /api/opencode/blocked`
- MCP tool transport: `POST|GET|DELETE /api/mcp`
- Batch sync backfill (optional machine token): `POST /api/integrations/linear/sync/batch` (stale-link query or explicit `story_ids`)

Queue dispatch notes:

- Dispatch claims one queued job at a time in created-order, then executes it.
- Failed jobs are re-queued with exponential backoff until `max_attempts`, then marked `failed`.

## Authoring sync behavior

- Story create/update with Linear enabled attempts direct best-effort sync.
- Story build/rebuild never performs inline Linear sync; it requires an existing link.

## Data tables involved

- `integration_settings`
- `story_linear_links`
- `build_runs`
- `build_run_items`
- `integration_webhook_receipts`
