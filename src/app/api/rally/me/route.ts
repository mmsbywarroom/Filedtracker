import { NextResponse } from "next/server";
import { requireRallyUser } from "@/lib/auth";
import { remainingEtaSeconds, formatEta, RALLY_REACHED_METERS } from "@/lib/rallyGeo";
import { prisma } from "@/lib/prisma";
import { isRallyOnDate, rallyDateYmd } from "@/lib/rallies";

export async function GET() {
  const ctx = await requireRallyUser();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user } = ctx;
  const rally = isRallyOnDate(user.rally) ? user.rally : null;
  const last = await prisma.rallyCheckin.findFirst({
    where: { userId: user.id },
    orderBy: { startedAt: "desc" },
  });
  const remaining = last ? remainingEtaSeconds(last.startedAt, last.etaSeconds, last.reachedAt) : null;
  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      vehicleNo: user.vehicleNo,
      vehicleType: user.vehicleType,
      acName: user.acName,
    },
    rally: rally
      ? { id: rally.id, name: rally.name, lat: rally.lat, lng: rally.lng, scheduledDate: rallyDateYmd(rally.scheduledDate) }
      : null,
    rallyOpensOn: !rally && user.rally ? rallyDateYmd(user.rally.scheduledDate) : null,
    last: last
      ? {
          id: last.id,
          headCount: last.headCount,
          startedAt: last.startedAt,
          etaLabel: formatEta(last.etaSeconds),
          remainingLabel: formatEta(remaining ?? 0),
          reached: Boolean(last.reachedAt) || last.distanceMeters <= RALLY_REACHED_METERS,
        }
      : null,
  });
}
