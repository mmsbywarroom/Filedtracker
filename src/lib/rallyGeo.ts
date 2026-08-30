import { googleMapsKey } from "@/lib/runtimeEnv";

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

export async function rallyTravelEta(opts: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
}): Promise<{ etaSeconds: number; distanceMeters: number }> {
  const straight = haversineMeters(
    { lat: opts.fromLat, lng: opts.fromLng },
    { lat: opts.toLat, lng: opts.toLng }
  );
  const key = googleMapsKey();
  if (!key) {
    return { etaSeconds: Math.max(60, Math.round((straight / 1000 / 25) * 3600)), distanceMeters: straight };
  }
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${opts.fromLat},${opts.fromLng}`);
  url.searchParams.set("destination", `${opts.toLat},${opts.toLng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("departure_time", "now");
  url.searchParams.set("traffic_model", "best_guess");
  url.searchParams.set("key", key);
  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = (await res.json()) as {
      routes?: Array<{
        legs?: Array<{
          distance?: { value?: number };
          duration?: { value?: number };
          duration_in_traffic?: { value?: number };
        }>;
      }>;
    };
    const leg = data.routes?.[0]?.legs?.[0];
    const eta = Number(leg?.duration_in_traffic?.value ?? leg?.duration?.value ?? 0);
    const dist = Number(leg?.distance?.value ?? straight);
    if (eta > 0) return { etaSeconds: eta, distanceMeters: dist };
  } catch {
    /* fall through */
  }
  return { etaSeconds: Math.max(60, Math.round((straight / 1000 / 25) * 3600)), distanceMeters: straight };
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
