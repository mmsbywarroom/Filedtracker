import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { haversineMeters } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Pt = { lat: number; lng: number };

function thin(points: Pt[], minMeters = 18) {
  if (points.length < 3) return points;
  const out: Pt[] = [points[0]];
  for (const p of points.slice(1, -1)) {
    if (haversineMeters(out[out.length - 1], p) >= minMeters) out.push(p);
  }
  out.push(points[points.length - 1]);
  return out.slice(0, 400);
}

export async function POST(req: Request) {
  if (!(await getSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = process.env["GOOGLE_MAPS_API_KEY"] || "";
  if (!key) return NextResponse.json({ points: [] });
  const body = await req.json().catch(() => null);
  const raw = Array.isArray(body?.points) ? (body.points as Pt[]) : [];
  const points = thin(
    raw.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
  );
  if (points.length < 2) return NextResponse.json({ points });

  const snapped: Pt[] = [];
  for (let i = 0; i < points.length; i += 99) {
    const chunk = points.slice(i, i + 100);
    const path = chunk.map((p) => `${p.lat},${p.lng}`).join("|");
    const url = `https://roads.googleapis.com/v1/snapToRoads?interpolate=true&key=${encodeURIComponent(key)}&path=${encodeURIComponent(path)}`;
    const res = await fetch(url);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.snappedPoints) continue;
    for (const s of data.snappedPoints) {
      snapped.push({ lat: s.location.latitude, lng: s.location.longitude });
    }
  }
  return NextResponse.json({ points: snapped.length ? snapped : points });
}
