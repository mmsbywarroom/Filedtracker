/** Local GPS math only — no maps / traffic APIs. */

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const RALLY_REACHED_METERS = 400;

/** Straight-line vs typical Indian roads (bends / village routes). */
const ROAD_FACTOR = 1.28;

function kmhForVehicle(vehicleType?: string | null) {
  const t = (vehicleType || "").toLowerCase();
  if (/bus|coach/.test(t)) return 28;
  if (/truck|lorry|tempo|mini/.test(t)) return 30;
  if (/tractor/.test(t)) return 22;
  if (/bike|scooter|act|motorcycle/.test(t)) return 35;
  if (/car|suv|innova|dzire|swift/.test(t)) return 38;
  return 32;
}

export function rallyTravelEta(opts: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  vehicleType?: string | null;
}): { etaSeconds: number; distanceMeters: number } {
  const straight = haversineMeters(
    { lat: opts.fromLat, lng: opts.fromLng },
    { lat: opts.toLat, lng: opts.toLng }
  );
  const roadMeters = straight * ROAD_FACTOR;
  const kmh = kmhForVehicle(opts.vehicleType);
  const hours = roadMeters / 1000 / kmh;
  const etaSeconds = Math.max(60, Math.round(hours * 3600));
  return { etaSeconds, distanceMeters: roadMeters };
}

export function remainingEtaSeconds(startedAt: Date, etaSeconds: number, reachedAt: Date | null) {
  if (reachedAt) return 0;
  const elapsed = Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000));
  return Math.max(0, etaSeconds - elapsed);
}

export function formatEta(seconds: number) {
  if (seconds <= 0) return "0 min";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h <= 0) return `${Math.max(1, m)} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
