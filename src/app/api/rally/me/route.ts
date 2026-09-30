import { NextResponse } from "next/server";
import { requireRallyUser } from "@/lib/auth";
import { remainingEtaSeconds, formatEta, normalizeIndiaLatLng, rallyTravelEta, RALLY_REACHED_METERS } from "@/lib/rallyGeo";
import { prisma } from "@/lib/prisma";
import { isRallyOnDate, rallyDateYmd } from "@/lib/rallies";

export async function GET() {
  const ctx = await requireRallyUser();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user } = ctx;
  const rally = isRallyOnDate(user.rally) ? user.rally : null;
  const venue = rally ? normalizeIndiaLatLng(rally.lat, rally.lng) : null;
  const last = await prisma.rallyCheckin.findFirst({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
  });
  const live =
    last && venue
      ? rallyTravelEta({
          fromLat: last.lat,
          fromLng: last.lng,
          toLat: venue.lat,
          toLng: venue.lng,
          vehicleType: user.vehicleType,
        })
      : null;
  const reached = Boolean(last?.reachedAt) || (live != null && live.distanceMeters <= RALLY_REACHED_METERS);
  const etaSeconds = reached ? 0 : live?.etaSeconds ?? last?.etaSeconds ?? 0;
  const remaining = last ? remainingEtaSeconds(last.startedAt, etaSeconds, reached ? last.reachedAt ?? last.startedAt : null) : null;
  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      vehicleNo: user.vehicleNo,
      vehicleType: user.vehicleType,
      acName: user.acName,
    },
    rally: rally && venue
      ? { id: rally.id, name: rally.name, lat: venue.lat, lng: venue.lng, scheduledDate: rallyDateYmd(rally.scheduledDate) }
      : null,
    rallyOpensOn: !rally && user.rally ? rallyDateYmd(user.rally.scheduledDate) : null,
    last: last
      ? {
          id: last.id,
          headCount: last.headCount,
          startedAt: last.startedAt,
          etaLabel: formatEta(etaSeconds),
          remainingLabel: formatEta(remaining ?? 0),
          reached,
        }
      : null,
  });
}
