import { NextResponse } from "next/server";
import { requireRallyUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeRallyPhoto } from "@/lib/rallyPhoto";
import { rallyTravelEta, RALLY_REACHED_METERS } from "@/lib/rallyGeo";

export async function POST(req: Request) {
  const ctx = await requireRallyUser();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user } = ctx;
  const rally = user.rally?.isActive
    ? user.rally
    : await prisma.rally.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
  if (!rally) return NextResponse.json({ error: "Rally venue is not set." }, { status: 400 });

  const body = await req.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const headCount = Math.max(0, Math.min(200, Math.round(Number(body?.headCount) || 0)));
  const photo = sanitizeRallyPhoto(body?.photo);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Location is required." }, { status: 400 });
  }
  if (!photo) {
    return NextResponse.json({ error: "Photo is required." }, { status: 400 });
  }

  const travel = rallyTravelEta({
    fromLat: lat,
    fromLng: lng,
    toLat: rally.lat,
    toLng: rally.lng,
    vehicleType: user.vehicleType,
  });
  const reached = travel.distanceMeters <= RALLY_REACHED_METERS;

  const checkin = await prisma.rallyCheckin.create({
    data: {
      rallyId: rally.id,
      userId: user.id,
      photo,
      headCount,
      lat,
      lng,
      distanceMeters: travel.distanceMeters,
      etaSeconds: reached ? 0 : travel.etaSeconds,
      reachedAt: reached ? new Date() : null,
    },
    select: { id: true, headCount: true, etaSeconds: true, distanceMeters: true, startedAt: true, reachedAt: true },
  });

  return NextResponse.json({ ok: true, checkin, rally: { name: rally.name } });
}
