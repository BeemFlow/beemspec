# System Flow

## Ownership model

- BeemSpec: planning source of truth (`what` and `why`)
- Linear: execution issue coordination
- OpenCode: coding runtime sessions

## Main release flow

1. User clicks **Build Release**.
2. BeemSpec creates `release_runs` row and enqueues `orchestration_jobs` row.
3. For each story:
   - reads existing `story_linear_links` mapping
   - creates OpenCode session via `@opencode-ai/sdk`
   - writes `release_run_items` with issue + session links
4. BeemSpec finalizes run status and counts.

If processing is interrupted, queued jobs can be resumed via dispatch endpoint.

### Run vs job

- `release_runs` is the user-visible record of a build attempt.
- `orchestration_jobs` is the worker queue envelope that executes that run durably.
- One run usually maps to one release-build job, but they are intentionally separate concerns.

## Single-story flow

1. User clicks **Build story**.
2. BeemSpec creates a one-item `release_runs` row.
3. Story sync + session creation runs for only that story.
4. Run and item are finalized and visible in Release Runs panel.

## Recovery/operations flow

- Retry failed items: `POST /api/release-runs/:id/retry`
- Manual per-story sync: `POST /api/stories/:id/sync-linear` (enqueue)
- Mark blocked: `POST /api/opencode/blocked`
- Batch reconcile (optional machine token): `POST /api/integrations/linear/reconcile/batch`

Queue dispatch notes:

- Dispatch claims one queued job at a time in created-order, then executes it.
- Failed jobs are re-queued with exponential backoff until `max_attempts`, then marked `failed`.

## Authoring sync behavior

- Story create/update with Linear enabled enqueues a `story_linear_sync` job.
- Story build/rebuild never performs inline Linear sync; it requires an existing link.

## Data tables involved

- `integration_settings`
- `story_linear_links`
- `release_runs`
- `release_run_items`
- `integration_webhook_receipts`
