# System Flow

## Ownership model

- BeemSpec: planning source of truth (`what` and `why`)
- Linear: execution issue coordination
- OpenCode: coding runtime sessions

## Main release flow

1. User clicks **Build Release**.
2. BeemSpec creates `release_runs` row and enqueues `orchestration_jobs` row.
3. For each story:
   - syncs to Linear (`story_linear_links` upsert)
   - creates OpenCode session via `@opencode-ai/sdk`
   - writes `release_run_items` with issue + session links
4. BeemSpec finalizes run status and counts.

If processing is interrupted, queued jobs can be resumed via dispatch endpoint.

## Single-story flow

1. User clicks **Build story**.
2. BeemSpec creates a one-item `release_runs` row.
3. Story sync + session creation runs for only that story.
4. Run and item are finalized and visible in Release Runs panel.

## Recovery/operations flow

- Retry failed items: `POST /api/release-runs/:id/retry`
- Manual per-story sync: `POST /api/stories/:id/sync-linear`
- Mark blocked: `POST /api/opencode/blocked`
- Batch reconcile (optional machine token): `POST /api/integrations/linear/reconcile/batch`

## Data tables involved

- `integration_settings`
- `story_linear_links`
- `release_runs`
- `release_run_items`
- `integration_webhook_receipts`
