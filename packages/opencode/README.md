# @beemspec/opencode

BeemSpec OpenCode plugin package.

It provides:

- Session compaction hook (`experimental.session.compacting`) that fetches fresh story data from the BeemSpec API on each compaction, ensuring long-running sessions never lose or stale-serve story context

It does not inject custom tools. BeemSpec tools are served by the app's HTTP MCP endpoint (`/api/mcp`).

## MCP tool coverage

The BeemSpec MCP endpoint exposes full story map management operations:

- Workflow helper: `storymap_workflow_guide`
- Story maps: list/get/create/update/delete
- Activities: create/update/delete/reorder
- Tasks: create/update/delete/reorder
- Releases: create/update/delete/reorder
- Stories: get/create/update/delete/reorder
- Personas: list/create/update/delete
- Build agent helpers: `story_context_get` and `story_mark_blocked`

## Usage

Add to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@beemspec/opencode"],
  "mcp": {
    "beemspec": {
      "type": "remote",
      "url": "http://127.0.0.1:3000/api/mcp",
      "oauth": true
    }
  }
}
```

If your MCP client does not support automatic OAuth, use manual bearer mode:

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
        "Authorization": "Bearer {env:BEEMSPEC_SUPABASE_ACCESS_TOKEN}"
      }
    }
  }
}
```

For local plugin files, import the runtime export:

```ts
import BeemSpecPlugin from '@beemspec/opencode/runtime'
export default BeemSpecPlugin
```

Required env vars:

- `BEEMSPEC_API_URL` (base URL of the BeemSpec instance, e.g. `http://127.0.0.1:3000`)
- `BEEMSPEC_SUPABASE_ACCESS_TOKEN` (Supabase user access token for MCP Authorization header)

The plugin calls `GET /api/opencode/sessions/:sessionId/context` on every compaction to pull the latest story data from Supabase rather than relying on a local cache.
