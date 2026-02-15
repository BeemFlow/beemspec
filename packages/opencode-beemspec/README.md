# opencode-beemspec

BeemSpec OpenCode plugin package.

It provides:

- OpenCode hook adapters for `experimental.session.compacting` and `experimental.chat.system.transform`
- lifecycle event handling (`session.created`, `session.updated`, `session.idle`, `session.error`)
- custom tools:
  - `beemspec_story`
  - `beemspec_blocked`

## Usage

Add to `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-beemspec"]
}
```

For local plugin files, import the runtime export:

```ts
import BeemSpecPlugin from 'opencode-beemspec/runtime'
export default BeemSpecPlugin
```

Required env for network-backed tools:

- `BEEMSPEC_BASE_URL` (for example `http://127.0.0.1:3000`)
- `BEEMSPEC_OPENCODE_TOKEN` (shared bearer token with BeemSpec API)
