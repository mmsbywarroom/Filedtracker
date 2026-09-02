import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeUser, userScopeWhere } from "@/lib/hierarchy";
import { istDateString, istDayBounds } from "@/lib/dailyAttendance";

type LocFix = { lat: number; lng: number; at: Date; source: string };

function pickLatestFix(candidates: (LocFix | null | undefined)[]): LocFix | null {
  const valid = candidates.filter((c): c is LocFix => !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng));
  if (!valid.length) return null;
  valid.sort((a, b) => b.at.getTime() - a.at.getTime());
  return valid[0];
}

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || istDateString();
  const liveOnly = searchParams.get("liveOnly") === "1";
  const { start, end } = istDayBounds(date);

  const users = await prisma.user.findMany({
    where: userScopeWhere(s.admin),
    select: {
      id: true,
      name: true,
      phone: true,
      designation: true,
      assemblyName: true,
      sectorAllotted: true,
      zone: true,
      district: true,
    },
  });

  const visible = users.filter((u) => canSeeUser(s.admin, u));
  const ids = visible.map((u) => u.id);
  if (!ids.length) {
    return NextResponse.json({ date, users: [] });
  }

  const attendances = await prisma.attendance.findMany({
    where: { userId: { in: ids }, punchInAt: { gte: start, lte: end } },
    orderBy: { punchInAt: "desc" },
    select: {
      id: true,
      userId: true,
      punchInAt: true,
      punchOutAt: true,
      punchInLat: true,
      punchInLng: true,
      punchOutLat: true,
      punchOutLng: true,
      lastKnownLat: true,
      lastKnownLng: true,
      lastKnownAt: true,
      points: { orderBy: { recordedAt: "desc" }, take: 1, select: { lat: true, lng: true, recordedAt: true } },
      intervalSnapshots: {
        orderBy: { recordedAt: "desc" },
        take: 1,
        select: { lat: true, lng: true, recordedAt: true },
      },
    },
  });

  const byUser = new Map<string, (typeof attendances)[number]>();
  for (const a of attendances) {
    const prev = byUser.get(a.userId);
    if (!prev) {
      byUser.set(a.userId, a);
      continue;
    }
    const prevLive = !prev.punchOutAt;
    const curLive = !a.punchOutAt;
    if (curLive && !prevLive) {
      byUser.set(a.userId, a);
      continue;
    }
    if (curLive === prevLive && a.punchInAt > prev.punchInAt) {
      byUser.set(a.userId, a);
    }
  }

  const userById = new Map(visible.map((u) => [u.id, u]));
  type LiveRow = {
    userId: string;
    name: string;
    phone: string;
    designation: string;
    assemblyName: string;
    sectorAllotted: string;
    zone: string;
    district: string;
    isLive: boolean;
    lat: number;
    lng: number;
    recordedAt: string;
    locationSource: string;
    punchInAt: string;
    punchOutAt: string | null;
  };

  const rows: LiveRow[] = Array.from(byUser.entries())
    .map(([userId, att]) => {
      const u = userById.get(userId)!;
      const isLive = !att.punchOutAt;
      const lastPt = att.points[0];
      const lastSnap = att.intervalSnapshots[0];
      const fix = pickLatestFix([
        att.lastKnownLat != null && att.lastKnownLng != null && att.lastKnownAt
          ? { lat: att.lastKnownLat, lng: att.lastKnownLng, at: att.lastKnownAt, source: "heartbeat" }
          : null,
        lastPt ? { lat: lastPt.lat, lng: lastPt.lng, at: lastPt.recordedAt, source: "track" } : null,
        lastSnap
          ? { lat: lastSnap.lat, lng: lastSnap.lng, at: lastSnap.recordedAt, source: "interval" }
          : null,
        isLive
          ? { lat: att.punchInLat, lng: att.punchInLng, at: att.punchInAt, source: "punch_in" }
          : att.punchOutLat != null && att.punchOutLng != null && att.punchOutAt
            ? { lat: att.punchOutLat, lng: att.punchOutLng, at: att.punchOutAt, source: "punch_out" }
            : { lat: att.punchInLat, lng: att.punchInLng, at: att.punchInAt, source: "punch_in" },
      ]);
      if (!fix) return null;
      return {
        userId,
        name: u.name,
        phone: u.phone,
        designation: u.designation,
        assemblyName: u.assemblyName,
        sectorAllotted: u.sectorAllotted,
        zone: u.zone,
        district: u.district,
        isLive,
        lat: fix.lat,
        lng: fix.lng,
        recordedAt: fix.at.toISOString(),
        locationSource: fix.source,
        punchInAt: att.punchInAt.toISOString(),
        punchOutAt: att.punchOutAt?.toISOString() || null,
      };
    })
    .filter((r): r is LiveRow => r != null)
    .filter((r) => !liveOnly || r.isLive);

  return NextResponse.json({ date, users: rows });
}
