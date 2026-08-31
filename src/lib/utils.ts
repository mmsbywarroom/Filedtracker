export const CSV_COLUMNS = [
  "Sector Incharge Name",
  "Sector Incharge Number",
  "Assembly Name",
  "Sector Allotted",
  "Zone",
  "District",
] as const;

export type CsvUserRow = {
  name: string;
  phone: string;
  assemblyName: string;
  sectorAllotted: string;
  zone: string;
  district: string;
};

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDuration(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} hr ${rem} min` : `${h} hr`;
}

export function formatKm(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export type LatLng = { lat: number; lng: number };

export type TrackPoint = LatLng & {
  recordedAt?: string | Date | number | null;
  accuracy?: number | null;
};

/** Ignore GPS jitter; cap speed so tower jumps don't become fake km. */
const TRACK_MIN_STEP_M = 12;
const TRACK_MAX_ACCURACY_M = 120;
/** ~58 km/h — realistic max for field / village travel. */
const TRACK_MAX_SPEED_MPS = 16;
/** Never credit more than this in one GPS hop (screen-off / tower switch). */
const TRACK_ABSOLUTE_MAX_STEP_M = 2500;

export function isPlausibleStep(
  from: LatLng,
  to: LatLng,
  accuracy?: number | null,
  dtMs?: number | null
) {
  if (accuracy != null && Number.isFinite(accuracy) && accuracy > TRACK_MAX_ACCURACY_M) return false;
  const gap = haversineMeters(from, to);
  if (gap < TRACK_MIN_STEP_M) return false;
  const dt =
    dtMs != null && Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 60_000;
  const slack = Math.min(60, Math.max(15, (accuracy ?? 35) * 0.4));
  const maxGap = Math.min(TRACK_ABSOLUTE_MAX_STEP_M, (dt / 1000) * TRACK_MAX_SPEED_MPS + slack);
  return gap <= maxGap;
}

function pointTime(p: TrackPoint, fallback: number) {
  if (p.recordedAt == null) return fallback;
  const t = new Date(p.recordedAt).getTime();
  return Number.isFinite(t) ? t : fallback;
}

/** Sum only GPS hops that pass speed + accuracy checks. */
export function filteredPathDistance(points: TrackPoint[]) {
  if (points.length < 2) return 0;
  let total = 0;
  let prev = points[0];
  let prevAt = pointTime(prev, Date.now());
  for (let i = 1; i < points.length; i++) {
    const cur = points[i];
    const curAt = pointTime(cur, prevAt + 60_000);
    const dt = Math.max(0, curAt - prevAt);
    if (isPlausibleStep(prev, cur, cur.accuracy ?? prev.accuracy, dt)) {
      total += haversineMeters(prev, cur);
      prev = cur;
      prevAt = curAt;
    } else {
      // Bad hop — start fresh from here (don't chain through a tower jump).
      prev = cur;
      prevAt = curAt;
    }
  }
  return total;
}

export function pathDistance(points: LatLng[]) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversineMeters(points[i - 1], points[i]);
  return d;
}

/** Real travel km for a session — filtered GPS path, not crow-fly or inflated stored totals. */
export function sessionTravelMeters(opts: {
  stored?: number | null;
  punchIn: LatLng;
  punchInAt?: string | Date | number | null;
  points?: TrackPoint[];
  punchOut?: LatLng | null;
  punchOutAt?: string | Date | number | null;
  live?: LatLng | null;
}) {
  const chain: TrackPoint[] = [{ ...opts.punchIn, recordedAt: opts.punchInAt ?? null, accuracy: null }];
  for (const p of opts.points || []) {
    chain.push(p);
  }
  if (opts.punchOut) {
    chain.push({ ...opts.punchOut, recordedAt: opts.punchOutAt ?? null, accuracy: null });
  } else if (opts.live) {
    chain.push({ ...opts.live, recordedAt: Date.now(), accuracy: null });
  }
  if (chain.length >= 2) return filteredPathDistance(chain);
  return Math.max(0, opts.stored || 0);
}

export function splitTrack<T extends LatLng>(points: T[], maxGapMeters = 8000): T[][] {
  if (!points.length) return [];
  const segs: T[][] = [[points[0]]];
  for (let i = 1; i < points.length; i++) {
    const gap = haversineMeters(points[i - 1], points[i]);
    if (gap > maxGapMeters) segs.push([points[i]]);
    else segs[segs.length - 1].push(points[i]);
  }
  return segs;
}

export function downsample<T>(items: T[], max = 320): T[] {
  if (items.length <= max) return items;
  const step = items.length / max;
  const out: T[] = [];
  for (let i = 0; i < max - 1; i++) out.push(items[Math.floor(i * step)]);
  out.push(items[items.length - 1]);
  return out;
}

