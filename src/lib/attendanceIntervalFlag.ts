/** Every 30 minutes between punch-in and punch-out, record lat/lng (native/iOS only). Flag if ≥8 match. */
export const INTERVAL_SNAPSHOT_MS = 30 * 60 * 1000;
export const PINNED_FLAG_MIN_COUNT = 8;
export const MAX_INTERVAL_SLOTS = 24; // 12 h session cap
/** Accept snapshot from 2 min before scheduled time. */
export const INTERVAL_SNAPSHOT_EARLY_MS = 2 * 60 * 1000;
/** Grace after scheduled time (timer drift / slow GPS). */
export const INTERVAL_SNAPSHOT_LATE_MS = 15 * 60 * 1000;

export function slotDueAtMs(punchInAt: Date | number, slot: number): number {
  const t = typeof punchInAt === "number" ? punchInAt : punchInAt.getTime();
  return t + slot * INTERVAL_SNAPSHOT_MS;
}

export function isSlotDueNow(punchInAt: Date, slot: number, now = Date.now()): boolean {
  const due = slotDueAtMs(punchInAt, slot);
  return now >= due - INTERVAL_SNAPSHOT_EARLY_MS && now <= due + INTERVAL_SNAPSHOT_LATE_MS;
}

/** True when GPS was captured near the scheduled 30-min mark (rejects batch backfill). */
export function isValidIntervalSnapshot(punchInAt: Date, slot: number, recordedAt: Date): boolean {
  const due = slotDueAtMs(punchInAt, slot);
  const rec = recordedAt.getTime();
  return rec >= due - INTERVAL_SNAPSHOT_EARLY_MS && rec <= due + INTERVAL_SNAPSHOT_LATE_MS;
}

export function filterValidIntervalSnapshots<
  T extends { slot: number; lat: number; lng: number; recordedAt: Date | string; punchInAt: Date | string },
>(snapshots: T[]): T[] {
  return snapshots.filter((s) =>
    isValidIntervalSnapshot(new Date(s.punchInAt), s.slot, new Date(s.recordedAt))
  );
}

export function coordKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export function buildIntervalSlotOffsets(maxMs = 12 * 60 * 60 * 1000): number[] {
  const slots: number[] = [];
  for (let i = 1; i * INTERVAL_SNAPSHOT_MS <= maxMs; i++) {
    slots.push(i * INTERVAL_SNAPSHOT_MS);
  }
  return slots;
}

export function isSessionPinnedByIntervals(
  snapshots: { lat: number; lng: number }[]
): { flagged: boolean; sameCount: number } {
  if (snapshots.length < PINNED_FLAG_MIN_COUNT) {
    return { flagged: false, sameCount: 0 };
  }
  const counts = new Map<string, number>();
  for (const s of snapshots) {
    const k = coordKey(s.lat, s.lng);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let max = 0;
  for (const c of Array.from(counts.values())) {
    if (c > max) max = c;
  }
  return { flagged: max >= PINNED_FLAG_MIN_COUNT, sameCount: max };
}

export function pinnedFlagReason(sameCount: number): string {
  return `${sameCount} native-app thirty-minute location checks at the same lat/lng — possible fake GPS (user stayed pinned).`;
}

export function userPinnedFlagFromSessions(
  sessions: { snapshots: { lat: number; lng: number }[] }[]
): { flagged: boolean; sameCount: number; reason: string } {
  let best = 0;
  for (const s of sessions) {
    const r = isSessionPinnedByIntervals(s.snapshots);
    if (r.sameCount > best) best = r.sameCount;
  }
  const flagged = best >= PINNED_FLAG_MIN_COUNT;
  return {
    flagged,
    sameCount: best,
    reason: flagged ? pinnedFlagReason(best) : "",
  };
}

export function dominantCoordGroup<T extends { lat: number; lng: number }>(
  snapshots: T[]
): { key: string; count: number; items: T[] } | null {
  if (!snapshots.length) return null;
  const groups = new Map<string, T[]>();
  for (const s of snapshots) {
    const k = coordKey(s.lat, s.lng);
    const list = groups.get(k) || [];
    list.push(s);
    groups.set(k, list);
  }
  let best: { key: string; count: number; items: T[] } | null = null;
  for (const [key, items] of Array.from(groups.entries())) {
    if (!best || items.length > best.count) {
      best = { key, count: items.length, items };
    }
  }
  return best;
}

export function slotLabel(slot: number): string {
  const mins = slot * 30;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m after punch-in`;
  if (h) return `${h}h after punch-in`;
  return `${m}m after punch-in`;
}
