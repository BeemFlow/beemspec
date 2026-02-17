# opencode-beemspec

BeemSpec OpenCode plugin package.

It provides:

- OpenCode hook adapters for `experimental.session.compacting` and `experimental.chat.system.transform`
- lifecycle event handling (`session.created`, `session.updated`, `session.idle`, `session.error`)

It does not inject custom tools. BeemSpec tools are served by the app's HTTP MCP endpoint (`/api/mcp`).

## Usage

Add to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-beemspec"],
  "mcp": {
    "beemspec": {
      "type": "remote",
      "url": "http://127.0.0.1:3000/api/mcp",
      "oauth": false,
      "headers": {
        "Authorization": "Bearer {env:BEEMSPEC_OPENCODE_TOKEN}"
      }
    }
  }
}
```

For local plugin files, import the runtime export:

```ts
import BeemSpecPlugin from 'opencode-beemspec/runtime'
export default BeemSpecPlugin
```

Required env for MCP auth (optional but recommended):

- `BEEMSPEC_OPENCODE_TOKEN` (shared bearer token with BeemSpec MCP endpoint)

The OpenCode plugin is intentionally hook-only. Tool execution flows through MCP (`beemspec_story`, `beemspec_blocked`).
