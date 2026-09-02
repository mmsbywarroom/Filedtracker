import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeUser, userScopeWhere } from "@/lib/hierarchy";
import { istDateString, istDayBounds } from "@/lib/dailyAttendance";

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
      points: { orderBy: { recordedAt: "desc" }, take: 1, select: { lat: true, lng: true, recordedAt: true } },
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
  const rows = Array.from(byUser.entries())
    .map(([userId, att]) => {
      const u = userById.get(userId)!;
      const isLive = !att.punchOutAt;
      const lastPt = att.points[0];
      const lat = lastPt?.lat ?? (isLive ? att.punchInLat : att.punchOutLat ?? att.punchInLat);
      const lng = lastPt?.lng ?? (isLive ? att.punchInLng : att.punchOutLng ?? att.punchInLng);
      const recordedAt = lastPt?.recordedAt ?? (isLive ? att.punchInAt : att.punchOutAt ?? att.punchInAt);
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
        lat,
        lng,
        recordedAt: recordedAt.toISOString(),
        punchInAt: att.punchInAt.toISOString(),
        punchOutAt: att.punchOutAt?.toISOString() || null,
      };
    })
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
    .filter((r) => !liveOnly || r.isLive);

  return NextResponse.json({ date, users: rows });
}
