# OpenCode Runtime Rollout

Use this checklist to install and verify the BeemSpec OpenCode plugin in a real runtime.

## 1) App prerequisites

- BeemSpec app is running and reachable.
- Env vars are set:
  - `BEEMSPEC_BASE_URL` (for plugin -> app API)
  - `BEEMSPEC_OPENCODE_TOKEN` (shared bearer token)
  - `LINEAR_API_KEY`

## 2) Install plugin in OpenCode

In `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-beemspec"]
}
```

For local plugin loading, use runtime export:

```ts
import BeemSpecPlugin from 'opencode-beemspec/runtime'
export default BeemSpecPlugin
```

## 3) Verify plugin tools

Confirm both tools are callable in session:

- `beemspec_story` (loads story context)
- `beemspec_blocked` (writes blocked reason)

## 4) Verify session hook behavior

- Build a story from BeemSpec (`POST /api/stories/:id/build`).
- Open created OpenCode session URL from run item.
- Confirm context is present in session content.

## 5) Verify release flow

- Build a release (`POST /api/releases/:id/build`).
- Confirm run items include:
  - `linear_issue_id`
  - `opencode_session_id`
  - `opencode_session_url`

## 6) Verify durable queue dispatch

Run dispatcher endpoint manually:

```bash
curl -X POST "http://127.0.0.1:3000/api/build-runs/dispatch?limit=5" \
  -H "Authorization: Bearer $BEEMSPEC_WORKER_TOKEN"
```

This processes queued build-run jobs and marks them completed/failed.
