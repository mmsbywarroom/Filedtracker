#!/usr/bin/env bash
set -euo pipefail
# Safe cleanup: running FieldTrack container/image is kept.
docker image prune -af >/dev/null
docker builder prune -af >/dev/null 2>/dev/null || true
docker container prune -f >/dev/null
rm -f /opt/filedtracker/filedtracker.tar.gz
journalctl --vacuum-time=3d >/dev/null 2>/dev/null || true
df -h / | tail -1
