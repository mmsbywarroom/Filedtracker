#!/usr/bin/env bash
# EC2 backup cron: close punch sessions open longer than 12 hours.
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/filedtracker/.env}"
URL="${AUTO_PUNCH_URL:-http://127.0.0.1:3000/api/cron/auto-punch-out}"

SECRET=""
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi

if [ -z "$SECRET" ]; then
  echo "CRON_SECRET not set in $ENV_FILE — auto punch-out cron skipped" >&2
  exit 1
fi

curl -fsS -m 60 -H "Authorization: Bearer ${SECRET}" "${URL}" || true
