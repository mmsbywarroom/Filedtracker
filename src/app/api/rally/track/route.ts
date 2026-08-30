import { NextResponse } from "next/server";
import { requireRallyUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { haversineMeters, RALLY_REACHED_METERS } from "@/lib/rallyGeo";
import { isRallyOnDate } from "@/lib/rallies";

export async function POST(req: Request) {
  const ctx = await requireRallyUser();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user } = ctx;
  const rally = user.rally;
  if (!isRallyOnDate(rally) || !rally) {
    return NextResponse.json({ error: "Rally is not open today." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Location is required." }, { status: 400 });
  }

  const open = await prisma.rallyCheckin.findFirst({
    where: { userId: user.id, rallyId: user.rallyId, reachedAt: null },
    orderBy: { startedAt: "desc" },
  });
  if (!open) return NextResponse.json({ ok: true });
  if (open.distanceMeters <= RALLY_REACHED_METERS) return NextResponse.json({ ok: true });

  const prev = {
    lat: open.lastLat ?? open.lat,
    lng: open.lastLng ?? open.lng,
  };
  const step = haversineMeters(prev, { lat, lng });
  const extra = step >= 12 ? step : 0;
  const movedMeters = (open.movedMeters || 0) + extra;
  const toVenue = haversineMeters({ lat, lng }, { lat: rally.lat, lng: rally.lng });
  const reached = toVenue <= RALLY_REACHED_METERS;

  await prisma.rallyCheckin.update({
    where: { id: open.id },
    data: {
      lastLat: lat,
      lastLng: lng,
      lastFixAt: new Date(),
      movedMeters,
      ...(reached ? { reachedAt: new Date() } : {}),
    },
  });

  return NextResponse.json({ ok: true, movedMeters: Math.round(movedMeters) });
}
