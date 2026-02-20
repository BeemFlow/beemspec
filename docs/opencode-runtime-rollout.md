# OpenCode Runtime Rollout

Use this checklist to install and verify the BeemSpec OpenCode + MCP integration in a real runtime.

## 1) App prerequisites

- BeemSpec app is running and reachable.
- Env vars are set:
  - `BEEMSPEC_OPENCODE_TOKEN` (shared bearer token)
  - Optional if OpenCode server uses HTTP basic auth:
    - `BEEMSPEC_OPENCODE_SERVER_USERNAME` (defaults to `opencode`)
    - `BEEMSPEC_OPENCODE_SERVER_PASSWORD`
  - `LINEAR_API_KEY`

## 2) Configure OpenCode plugin + MCP server

In `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@beemspec/opencode"],
  "mcp": {
    "beemspec": {
      "type": "remote",
      "url": "http://127.0.0.1:3000/api/mcp",
      "oauth": false,
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

For local plugin loading, use runtime export:

```ts
import BeemSpecPlugin from '@beemspec/opencode/runtime'
export default BeemSpecPlugin
```

## 3) Verify MCP tools

Confirm both tools are callable in session:

- `beemspec_story` (loads story context)
- `beemspec_blocked` (writes blocked reason)

## 4) Verify session hook behavior

- Build a story from BeemSpec (`POST /api/stories/:id/build`).
- Open created OpenCode session URL from run item.
- Run `beemspec_story` in the session.
- Confirm context is present in session content and preserved after compaction.

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
