import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { remainingEtaSeconds, formatEta, RALLY_REACHED_METERS } from "@/lib/rallyGeo";

export async function GET() {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rally = await prisma.rally.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
  if (!rally) return NextResponse.json({ rally: null, rows: [] });

  const checkins = await prisma.rallyCheckin.findMany({
    where: { rallyId: rally.id },
    orderBy: { startedAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          phone: true,
          zone: true,
          district: true,
          acName: true,
          villageWard: true,
          vehicleNo: true,
          vehicleType: true,
          pocName: true,
          pocNumber: true,
        },
      },
    },
  });

  const latest = new Map<string, (typeof checkins)[number]>();
  for (const c of checkins) {
    if (!latest.has(c.userId)) latest.set(c.userId, c);
  }

  const now = new Date();
  const rows = [];
  for (const c of Array.from(latest.values())) {
    let remaining = remainingEtaSeconds(c.startedAt, c.etaSeconds, c.reachedAt);
    let reachedAt = c.reachedAt;
    if (!reachedAt && (c.distanceMeters <= RALLY_REACHED_METERS || remaining <= 0)) {
      reachedAt = remaining <= 0 ? new Date(c.startedAt.getTime() + c.etaSeconds * 1000) : now;
      remaining = 0;
      void prisma.rallyCheckin.update({ where: { id: c.id }, data: { reachedAt } }).catch(() => {});
    }
    rows.push({
      id: c.id,
      photo: c.photo,
      headCount: c.headCount,
      lat: c.lat,
      lng: c.lng,
      distanceMeters: c.distanceMeters,
      etaSeconds: c.etaSeconds,
      etaLabel: formatEta(c.etaSeconds),
      remainingSeconds: remaining,
      remainingLabel: formatEta(remaining),
      startedAt: c.startedAt,
      reachedAt,
      user: c.user,
    });
  }

  return NextResponse.json({
    rally: { id: rally.id, name: rally.name, lat: rally.lat, lng: rally.lng },
    rows,
  });
}
