/** Every 30 minutes between punch-in and punch-out, record lat/lng. Flag if ≥8 match. */
export const INTERVAL_SNAPSHOT_MS = 30 * 60 * 1000;
export const PINNED_FLAG_MIN_COUNT = 8;
export const MAX_INTERVAL_SLOTS = 24; // 12 h session cap

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
  return `${sameCount} thirty-minute location checks at the same lat/lng — review for possible fake GPS.`;
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
