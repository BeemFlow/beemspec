#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BEEMSPEC_BASE_URL:-http://localhost:3000}"
TOKEN="${BEEMSPEC_RECONCILE_CRON_TOKEN:-}"
LIMIT="${BEEMSPEC_RECONCILE_BATCH_LIMIT:-25}"
OLDER_THAN_MINUTES="${BEEMSPEC_RECONCILE_OLDER_THAN_MINUTES:-30}"

if [[ -z "$TOKEN" ]]; then
  echo "BEEMSPEC_RECONCILE_CRON_TOKEN is required"
  exit 1
fi

curl --fail --silent --show-error \
  -X POST "${BASE_URL}/api/integrations/linear/reconcile/batch" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{\"limit\":${LIMIT},\"older_than_minutes\":${OLDER_THAN_MINUTES}}"
