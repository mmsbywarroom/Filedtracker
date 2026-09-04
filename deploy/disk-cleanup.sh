#!/usr/bin/env bash
# Free disk on EC2 so deploys and the app do not die when logs fill the disk.
# Cron: every 6 hours + daily deep clean (see deploy.yml).
set -uo pipefail

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

DEEP="${1:-}"
if [ "$DEEP" = "--daily" ] || [ "$DEEP" = "daily" ]; then
  DEEP=1
else
  DEEP=0
fi

log "cleanup start deep=$DEEP"
df -h / | tail -1 || true

# --- Docker container JSON logs ---
# Normal: truncate files > 15MB. Daily: truncate anything > 5MB.
LOG_LIMIT=15728640
if [ "$DEEP" = "1" ]; then
  LOG_LIMIT=5242880
fi
if [ -d /var/lib/docker/containers ]; then
  find /var/lib/docker/containers -name '*-json.log' -type f 2>/dev/null | while read -r f; do
    size=$(stat -c%s "$f" 2>/dev/null || echo 0)
    if [ "${size:-0}" -gt "$LOG_LIMIT" ]; then
      log "truncate docker log $(basename "$(dirname "$f")") size=$size"
      : > "$f" || true
    fi
  done
fi

# --- App / nginx / cron logs ---
for f in \
  /var/log/filedtracker-cleanup.log \
  /var/log/filedtracker-auto-punch.log \
  /var/log/nginx/access.log \
  /var/log/nginx/error.log \
  /var/log/messages \
  /var/log/cron
do
  if [ -f "$f" ]; then
    size=$(stat -c%s "$f" 2>/dev/null || echo 0)
    limit=5242880
    if [ "$DEEP" = "1" ]; then limit=1048576; fi
    if [ "${size:-0}" -gt "$limit" ]; then
      log "trim $f size=$size"
      tail -n 200 "$f" > "${f}.tmp" 2>/dev/null && mv "${f}.tmp" "$f" || : > "$f"
    fi
  fi
done

# --- Deploy leftovers ---
rm -f /opt/filedtracker/filedtracker.tar.gz /tmp/filedtracker.tar.gz 2>/dev/null || true
rm -f /opt/filetracker/filedtracker.tar.gz 2>/dev/null || true
rm -rf /opt/filedtracker/.next /tmp/npm-* /tmp/node-jiti-* 2>/dev/null || true

# --- Docker unused data (never remove the running app container/image by name force) ---
docker image prune -af >/dev/null 2>&1 || true
docker builder prune -af >/dev/null 2>&1 || true
docker container prune -f >/dev/null 2>&1 || true
docker network prune -f >/dev/null 2>&1 || true
docker volume prune -f >/dev/null 2>&1 || true

if [ "$DEEP" = "1" ]; then
  # Drop build cache + dangling everything again
  docker system prune -af >/dev/null 2>&1 || true
  # Old rotated logs
  find /var/log -xdev -type f \( -name '*.gz' -o -name '*.old' -o -name '*.1' -o -name '*.2' \) -mtime +2 -delete 2>/dev/null || true
  find /var/log -xdev -type f -name '*.log.*' -mtime +3 -delete 2>/dev/null || true
fi

# --- Journal ---
if [ "$DEEP" = "1" ]; then
  journalctl --vacuum-size=40M >/dev/null 2>&1 || true
  journalctl --vacuum-time=12h >/dev/null 2>&1 || true
else
  journalctl --vacuum-size=80M >/dev/null 2>&1 || true
  journalctl --vacuum-time=1d >/dev/null 2>&1 || true
fi

# --- Package cache + temp ---
dnf clean all >/dev/null 2>&1 || yum clean all >/dev/null 2>&1 || true
find /tmp -xdev -type f -mtime +1 -delete 2>/dev/null || true
find /var/tmp -xdev -type f -mtime +2 -delete 2>/dev/null || true
if [ "$DEEP" = "1" ]; then
  find /tmp -xdev -type f -mmin +180 -delete 2>/dev/null || true
fi

# Warn if still tight (<1.5GB free)
AVAIL_KB=$(df -Pk / | awk 'NR==2{print $4}')
log "cleanup done avail_kb=${AVAIL_KB:-?}"
df -h / | tail -1 || true
if [ "${AVAIL_KB:-0}" -lt 1500000 ]; then
  log "WARNING: disk still low (<1.5GB free) — check /var/lib/docker"
  du -xh /var/lib/docker 2>/dev/null | sort -h | tail -15 || true
fi
