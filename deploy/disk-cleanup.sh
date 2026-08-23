#!/usr/bin/env bash
# Free disk on EC2 so the app does not hang / crash-loop when logs fill the disk.
set -uo pipefail

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

log "cleanup start"
df -h / | tail -1 || true

# Truncate huge Docker container JSON logs (>20MB)
if [ -d /var/lib/docker/containers ]; then
  find /var/lib/docker/containers -name '*-json.log' -type f 2>/dev/null | while read -r f; do
    size=$(stat -c%s "$f" 2>/dev/null || echo 0)
    if [ "${size:-0}" -gt 20971520 ]; then
      log "truncate docker log $(basename "$(dirname "$f")") size=$size"
      : > "$f" || true
    fi
  done
fi

# App / cron logs — keep small
for f in /var/log/filedtracker-cleanup.log /var/log/filedtracker-auto-punch.log /var/log/nginx/access.log /var/log/nginx/error.log; do
  if [ -f "$f" ]; then
    size=$(stat -c%s "$f" 2>/dev/null || echo 0)
    if [ "${size:-0}" -gt 5242880 ]; then
      log "trim $f size=$size"
      tail -n 300 "$f" > "${f}.tmp" 2>/dev/null && mv "${f}.tmp" "$f" || : > "$f"
    fi
  fi
done

# Docker unused data (keep running image/container)
docker image prune -af >/dev/null 2>&1 || true
docker builder prune -af >/dev/null 2>&1 || true
docker container prune -f >/dev/null 2>&1 || true
docker network prune -f >/dev/null 2>&1 || true

rm -f /opt/filedtracker/filedtracker.tar.gz /tmp/filedtracker.tar.gz 2>/dev/null || true
rm -rf /tmp/npm-* /tmp/node-jiti-* 2>/dev/null || true

# System journal — cap size (disk full = app death)
journalctl --vacuum-size=80M >/dev/null 2>&1 || true
journalctl --vacuum-time=1d >/dev/null 2>&1 || true

# Package manager cache
dnf clean all >/dev/null 2>&1 || yum clean all >/dev/null 2>&1 || true

# Old temp files
find /tmp -xdev -type f -mtime +1 -delete 2>/dev/null || true
find /var/tmp -xdev -type f -mtime +2 -delete 2>/dev/null || true

log "cleanup done"
df -h / | tail -1 || true
