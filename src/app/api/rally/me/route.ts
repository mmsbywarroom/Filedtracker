import { NextResponse } from "next/server";
import { requireRallyUser } from "@/lib/auth";
import { remainingEtaSeconds, formatEta, RALLY_REACHED_METERS } from "@/lib/rallyGeo";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const ctx = await requireRallyUser();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user } = ctx;
  const rally = user.rally?.isActive
    ? user.rally
    : await prisma.rally.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
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
    rally: rally ? { id: rally.id, name: rally.name, lat: rally.lat, lng: rally.lng } : null,
    last: last
      ? {
          id: last.id,
          headCount: last.headCount,
          startedAt: last.startedAt,
          etaLabel: formatEta(last.etaSeconds),
          remainingLabel: formatEta(remaining ?? 0),
          reached: Boolean(last.reachedAt) || last.distanceMeters <= RALLY_REACHED_METERS || (remaining ?? 1) <= 0,
        }
      : null,
  });
}
