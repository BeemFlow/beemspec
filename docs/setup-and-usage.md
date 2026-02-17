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
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

Linear:

- OAuth (recommended):
  - `LINEAR_CLIENT_ID`
  - `LINEAR_CLIENT_SECRET`
  - `LINEAR_OAUTH_REDIRECT_URI`
- Optional fallback:
  - `LINEAR_API_KEY`

OpenCode:

- `BEEMSPEC_OPENCODE_BASE_URL` (default `http://127.0.0.1:4096`)
- `BEEMSPEC_OPENCODE_WEB_BASE_URL` (optional deep-link host)
- `BEEMSPEC_OPENCODE_TOKEN` (shared token for OpenCode MCP client -> BeemSpec API)
- Optional OpenCode HTTP basic auth (for password-protected OpenCode servers):
  - `BEEMSPEC_OPENCODE_SERVER_USERNAME` (defaults to `opencode` if password is set)
  - `BEEMSPEC_OPENCODE_SERVER_PASSWORD`
  - fallback envs are also supported: `OPENCODE_SERVER_USERNAME`, `OPENCODE_SERVER_PASSWORD`

Optional batch sync auth:

- `BEEMSPEC_SYNC_CRON_TOKEN`

Optional build-run dispatch auth:

- `BEEMSPEC_WORKER_TOKEN`

## 3) Database migrations

Apply all migrations in `supabase/migrations`.

Note: integrations, build-run schema, worker queue schema, and atomic queue functions are consolidated in `003_story_linear_links.sql`.

## 4) Configure team integration

From team settings, set Linear integration target values.

API equivalent:

- `PUT /api/teams/:id/integrations/linear`

Then connect Linear OAuth for that team:

- `GET /api/integrations/linear/oauth/start?team_id=:id&return_to=/`

You can also do this from Team Settings -> General -> Linear Integration in the app.

OAuth callback endpoint:

- `GET /api/integrations/linear/oauth/callback`

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

Story create/update with Linear enabled will attempt direct sync automatically (best effort).

## 6) Build one story

In run detail, use **Build story** on an item.

API equivalent:

- `POST /api/stories/:id/build`
- `POST /api/stories/:id/build?build_run_id=:id` to append to an existing build run session

## 7) Operate and recover

From run detail:

- **Retry failed**: enqueues retry for failed run items
- **Re-sync**: runs direct story sync to Linear
- **Mark blocked**: mark latest story run item blocked with a reason

APIs:

- `POST /api/build-runs/:id/retry`
- `POST /api/stories/:id/sync-linear`
- `POST /api/opencode/blocked`

## 8) OpenCode + MCP usage

Package: `packages/opencode-beemspec`

For OpenCode runtime, load:

- `opencode-beemspec/runtime`

Add remote MCP server config in OpenCode:

- server name: `beemspec`
- url: `http://127.0.0.1:3000/api/mcp`
- tools exposed by MCP server: `beemspec_story`, `beemspec_blocked`
- optional auth header: `Authorization: Bearer $BEEMSPEC_OPENCODE_TOKEN`

MCP endpoint served by this app:

- `POST /api/mcp`
- `GET /api/mcp`
- `DELETE /api/mcp`

## 9) Durable queue dispatch

Only build-run execution is queued.

You can dispatch queued build-run jobs manually with:

- `POST /api/build-runs/dispatch?limit=5`
