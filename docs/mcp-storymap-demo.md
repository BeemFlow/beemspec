# BeemSpec MCP Story Map Demo Guide

This guide gets BeemSpec's MCP server running so a coding agent can fully manage story maps.

## 1) Required environment

Set these env vars for the BeemSpec app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

MCP authentication uses a user OAuth access token (Supabase Auth), not a shared static token.

## 2) Start BeemSpec

```bash
npm run dev
```

MCP endpoint:

- `http://127.0.0.1:3000/api/mcp`

## 3) Connect a coding agent

Preferred (automatic OAuth for MCP clients that support it):

```json
{
  "mcp": {
    "beemspec": {
      "type": "remote",
      "url": "http://127.0.0.1:3000/api/mcp",
      "oauth": true
    }
  }
}
```

Fallback (manual bearer token):

```json
{
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

If using manual bearer mode, get a Supabase user access token for an account that has the team permissions you need.

## 4) Core MCP tools

- Workflow helper: `storymap_workflow_guide` (recommended first call for agents)
- Teams: `team_list`
- Story maps: `storymap_list` (team_id optional for single-team users), `storymap_get` (by id or name), `storymap_create`, `storymap_update`, `storymap_delete`
- Activities: `activity_create`, `activity_update`, `activity_delete`, `activity_reorder`
- Tasks: `task_create`, `task_update`, `task_delete`, `task_reorder`
- Releases: `release_create`, `release_update`, `release_delete`, `release_reorder`
- Stories: `story_get`, `story_create`, `story_update`, `story_delete`, `story_reorder`
- Personas: `persona_list`, `persona_create`, `persona_update`, `persona_delete`
- Agent helpers: `story_context_get`, `story_mark_blocked`

## 5) Demo flow suggestion

1. Call `storymap_list` with a team UUID.
2. Call `storymap_get` on one map.
3. Create a new activity, task, and story.
4. Reorder tasks or stories.
5. Update the story status/content.
6. Mark the story blocked with `story_mark_blocked`.
