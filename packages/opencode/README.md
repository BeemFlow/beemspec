# @beemspec/opencode

BeemSpec OpenCode plugin package.

It provides an `experimental.session.compacting` hook that pulls current story-map context through BeemSpec MCP and injects compacted context into the session.

It does not inject custom tools. BeemSpec tools are served by the app's HTTP MCP endpoint (`/api/mcp`).

## MCP tool coverage

The BeemSpec MCP endpoint exposes full story map management operations:

- Workflow helper: `storymap_workflow_guide`
- Story maps: list/get/create/update (`delete` remains API-only)
- Activities: create/update/delete/reorder
- Tasks: create/update/delete/reorder/move
- Releases: create/update/delete/reorder
- Stories: get/create/update/delete/reorder/move
- Personas: list/create/update/delete
- Build agent helper: `story_context_get`

## Usage

### Interactive setup

If you want OpenCode to walk you through the setup instead of editing `opencode.json` yourself:

1. Run:

```bash
opencode mcp add
```

2. Answer the prompts with:

```text
MCP server name:
beemspec

Select MCP server type:
Remote

MCP server URL:
http://127.0.0.1:3000/api/mcp

Does this server require OAuth authentication?:
Yes

Do you have a pre-registered client ID?:
No
```

3. Authenticate:

```bash
opencode mcp auth beemspec
```

### Manual setup

1. Add to `opencode.json`:

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

2. Authenticate:

```bash
opencode mcp auth beemspec
```

If your MCP client does not support automatic OAuth, use manual bearer mode instead:

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

The plugin calls MCP `tools/call` with `storymap_get` on each compaction to pull fresh planning context instead of relying on local cache.
