# @beemspec/opencode

BeemSpec OpenCode plugin package.

It provides an `experimental.session.compacting` hook that pulls current story-map context through BeemSpec MCP and injects compacted context into the session.

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
- Build agent helper: `story_context_get`

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
      "oauth": {}
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
- `BEEMSPEC_MCP_TOKEN` (OAuth/Bearer token accepted by `/api/mcp`)
- `BEEMSPEC_STORY_MAP_ID` (story map UUID)

Optional:

- `BEEMSPEC_MCP_URL` (defaults to `${BEEMSPEC_API_URL}/api/mcp`)
- `BEEMSPEC_RELEASE_ID` (limit compaction to one release)

The plugin calls MCP `tools/call` with `storymap_get` on each compaction to pull the latest story data instead of relying on local cache.
