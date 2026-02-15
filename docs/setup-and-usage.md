# Setup and Usage

This is the fastest path to run the end-to-end flow.

## 1) Install and run

```bash
npm install
npm run dev
```

## 2) Required env vars

Core:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`)

Linear:

- `BEEMSPEC_ENABLE_LINEAR=true`
- `LINEAR_API_KEY` (or `BEEMSPEC_LINEAR_API_KEY`)

OpenCode:

- `BEEMSPEC_ENABLE_OPENCODE=true`
- `BEEMSPEC_OPENCODE_BASE_URL` (default `http://127.0.0.1:4096`)
- `BEEMSPEC_OPENCODE_WEB_BASE_URL` (optional deep-link host)
- `BEEMSPEC_OPENCODE_TOKEN` (shared token for plugin -> BeemSpec API)

Optional batch reconcile auth:

- `BEEMSPEC_RECONCILE_CRON_TOKEN`

Optional release worker dispatch auth:

- `BEEMSPEC_RELEASE_WORKER_TOKEN`

## 3) Database migrations

Apply all migrations in `supabase/migrations`.

Note: build-run retry/session metadata is now consolidated directly in `004_build_runs.sql`.

## 4) Configure team integration

From team settings, set Linear integration target values.

API equivalent:

- `PUT /api/teams/:id/integrations/linear`

## 5) Build a release

In Story Map page:

1. Open a map with release stories.
2. Use **Build Runs** panel.
3. Click **Build Release**.

This will:

- create/reuse one OpenCode session per build run
- reuse the latest active run for the release when appending new stories
- store run + item results
- fail items that are not yet synced to Linear

Story create/update with Linear enabled will enqueue a story sync job automatically.

## 6) Build one story

In run detail, use **Build story** on an item.

API equivalent:

- `POST /api/stories/:id/build`

## 7) Operate and recover

From run detail:

- **Retry failed**: enqueues retry for failed run items
- **Re-sync**: enqueues story sync to Linear
- **Mark blocked**: mark latest story run item blocked with a reason

APIs:

- `POST /api/build-runs/:id/retry`
- `POST /api/stories/:id/sync-linear`
- `POST /api/opencode/blocked`

## 8) OpenCode plugin usage

Package: `packages/opencode-beemspec`

For OpenCode runtime, load:

- `opencode-beemspec/runtime`

Tool-backed endpoints used by plugin:

- `GET /api/opencode/story/:id`
- `POST /api/opencode/blocked`

## 9) Durable queue dispatch

Build and Linear sync actions are enqueued as orchestration jobs.

You can dispatch queued jobs manually with:

- `POST /api/orchestration/jobs/dispatch?limit=5`
