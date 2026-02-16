# Linear Sync Cron Setup

Use this when running BeemSpec on your main machine and you want automatic drift correction.

## Environment

Set these in the environment where cron runs:

- `BEEMSPEC_BASE_URL` (default: `http://localhost:3000`)
- `BEEMSPEC_SYNC_CRON_TOKEN` (required)
- `BEEMSPEC_SYNC_BATCH_LIMIT` (optional, default `25`)
- `BEEMSPEC_SYNC_OLDER_THAN_MINUTES` (optional, default `30`)

## Example Crontab

Run every 20 minutes:

```cron
*/20 * * * * curl --fail --silent --show-error -X POST "${BEEMSPEC_BASE_URL:-http://localhost:3000}/api/integrations/linear/sync/batch" -H "Content-Type: application/json" -H "Authorization: Bearer ${BEEMSPEC_SYNC_CRON_TOKEN}" -d "{\"limit\":${BEEMSPEC_SYNC_BATCH_LIMIT:-25},\"older_than_minutes\":${BEEMSPEC_SYNC_OLDER_THAN_MINUTES:-30}}" >> /Users/alec/Workspace/beemspec/logs/sync-cron.log 2>&1
```

Make sure BeemSpec app server is running before cron executes.
