import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { remainingEtaSeconds, formatEta, RALLY_REACHED_METERS, isRallyNoMove } from "@/lib/rallyGeo";
import { resolveRally, rallyDateYmd } from "@/lib/rallies";

export async function GET(req: Request) {
  const s = await requireSuperAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rallyId = new URL(req.url).searchParams.get("rallyId");
  const rally = await resolveRally(rallyId);
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

  const now = new Date();
  const rows = [];
  for (const c of checkins) {
    let remaining = remainingEtaSeconds(c.startedAt, c.etaSeconds, c.reachedAt);
    let reachedAt = c.reachedAt;
    if (!reachedAt && c.distanceMeters <= RALLY_REACHED_METERS) {
      reachedAt = now;
      remaining = 0;
      void prisma.rallyCheckin.update({ where: { id: c.id }, data: { reachedAt } }).catch(() => {});
    }
    const noMove = isRallyNoMove({ ...c, reachedAt });
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
      noMove,
      movedMeters: Math.round(c.movedMeters || 0),
      user: c.user,
    });
  }
  rows.sort((a, b) => Number(b.noMove) - Number(a.noMove));

  return NextResponse.json({
    rally: {
      id: rally.id,
      name: rally.name,
      lat: rally.lat,
      lng: rally.lng,
      scheduledDate: rally.scheduledDate,
    },
    rows,
  });
}
