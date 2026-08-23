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

if [ -n "$SECRET" ]; then
  curl -fsS -m 60 "${URL}?secret=${SECRET}" || true
else
  # No secret configured: still try (endpoint allows localhost-style ops via Bearer empty only in non-prod;
  # production should set CRON_SECRET — we send a host-local header as well).
  curl -fsS -m 60 -H "x-filedtracker-cron: 1" "${URL}" || true
fi
