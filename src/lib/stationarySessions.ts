import { haversineMeters, mapGpsSpreadFromFixes } from "@/lib/utils";

export type StationarySessionRow = {
  userId: string;
  sameLocation: boolean;
  date: string;
  name: string;
  phone: string;
  designation: string;
  assembly: string;
  sector: string;
  zone: string;
  district: string;
  punchIn: string;
  punchOut: string;
  durationH: string;
  travelM: number;
  mapSpreadM: number;
  punchInOutGapM: number | null;
  trackPoints: number;
  punchOutReason: string;
  punchInLat: number;
  punchInLng: number;
  punchOutLat: number | null;
  punchOutLng: number | null;
  gpsMapSpreadM: number | null;
  attendanceId: string;
};

export type UniqueStationaryUser = {
  userId: string;
  name: string;
  phone: string;
  designation: string;
  assembly: string;
  sector: string;
  zone: string;
  district: string;
  sessions: number;
  days: number;
  totalHours: number;
  maxHours: number;
  avgTravelM: number;
  maxMapSpreadM: number;
  /** Sorted DD-MM-YYYY dates when user stayed at one location. */
  sameLocationDates: string;
  lastDate: string;
  lastPunchIn: string;
  lastPunchOut: string;
};

export function sessionSpreadM(
  punchIn: { lat: number; lng: number },
  punchOut: { lat: number; lng: number } | null,
  points: { lat: number; lng: number }[]
) {
  const fixes = [{ lat: punchIn.lat, lng: punchIn.lng }, ...points];
  if (punchOut) fixes.push(punchOut);
  return mapGpsSpreadFromFixes(fixes);
}

export function isSameLocationSession(opts: {
  distanceMeters: number;
  spreadM: number;
  inOutGapM: number | null;
  maxM: number;
}) {
  return (
    opts.distanceMeters <= opts.maxM &&
    opts.spreadM <= opts.maxM &&
    (opts.inOutGapM == null || opts.inOutGapM <= opts.maxM)
  );
}

/** YYYY-MM-DD → DD-MM-YYYY for CSV readability. */
function formatIstDateLabel(ymd: string) {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}-${m}-${y}`;
}

/** One row per user — who had at least one same-location session in the period. */
export function aggregateUniqueStationaryUsers(rows: StationarySessionRow[]): UniqueStationaryUser[] {
  const byUser = new Map<string, UniqueStationaryUser & { daySet: Set<string>; travelSum: number }>();

  for (const r of rows) {
    if (!r.sameLocation) continue;
    const key = r.userId || r.phone;
    let agg = byUser.get(key);
    if (!agg) {
      agg = {
        userId: r.userId,
        name: r.name,
        phone: r.phone,
        designation: r.designation,
        assembly: r.assembly,
        sector: r.sector,
        zone: r.zone,
        district: r.district,
        sessions: 0,
        days: 0,
        totalHours: 0,
        maxHours: 0,
        avgTravelM: 0,
        maxMapSpreadM: 0,
        sameLocationDates: "",
        lastDate: r.date,
        lastPunchIn: r.punchIn,
        lastPunchOut: r.punchOut,
        daySet: new Set<string>(),
        travelSum: 0,
      };
      byUser.set(key, agg);
    }

    agg.sessions += 1;
    agg.daySet.add(r.date);
    const hours = parseFloat(r.durationH) || 0;
    agg.totalHours += hours;
    agg.maxHours = Math.max(agg.maxHours, hours);
    agg.travelSum += r.travelM;
    agg.maxMapSpreadM = Math.max(agg.maxMapSpreadM, r.mapSpreadM, r.gpsMapSpreadM ?? 0);
    if (r.date >= agg.lastDate) {
      agg.lastDate = r.date;
      agg.lastPunchIn = r.punchIn;
      agg.lastPunchOut = r.punchOut;
    }
  }

  return Array.from(byUser.values())
    .map(({ daySet, travelSum, sessions, ...rest }) => {
      const sortedDates = Array.from(daySet).sort();
      return {
        ...rest,
        sessions,
        days: daySet.size,
        sameLocationDates: sortedDates.map(formatIstDateLabel).join("; "),
        avgTravelM: sessions ? Math.round(travelSum / sessions) : 0,
        totalHours: Math.round(rest.totalHours * 10) / 10,
        maxHours: Math.round(rest.maxHours * 10) / 10,
      };
    })
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

export function punchInOutGapM(att: {
  punchInLat: number;
  punchInLng: number;
  punchOutLat: number | null;
  punchOutLng: number | null;
}) {
  if (att.punchOutLat == null || att.punchOutLng == null) return null;
  return haversineMeters(
    { lat: att.punchInLat, lng: att.punchInLng },
    { lat: att.punchOutLat, lng: att.punchOutLng }
  );
}
