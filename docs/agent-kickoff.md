# Agent kickoff flow

BeemSpec no longer pushes work into a hosted coding runtime. Instead, developers run their own coding agent locally and pull context through MCP.

## Recommended flow

1. Open a story map in BeemSpec.
2. In **Agent Kickoff**, choose the target release.
3. Click **Copy Starter Prompt**.
4. Paste into your coding agent (OpenCode, Claude Code, Cursor, etc.).
5. Let the agent call MCP tools (`storymap_get`, then `story_context_get`) to fetch current context.

## Why this model

- Keeps code execution local and developer-controlled.
- Avoids tenant-hosted coding runtimes.
- Makes MCP the single integration surface for all agents.

## Optional OpenCode plugin compaction

If you use the OpenCode plugin, it can add compacted BeemSpec context from MCP.

Set these plugin env vars:

- `BEEMSPEC_MCP_URL` (optional if `BEEMSPEC_API_URL` is set)
- `BEEMSPEC_API_URL` (used to derive MCP URL)
- `BEEMSPEC_MCP_TOKEN` (OAuth/Bearer token accepted by `/api/mcp`)
- `BEEMSPEC_STORY_MAP_ID`
- `BEEMSPEC_RELEASE_ID` (optional)
