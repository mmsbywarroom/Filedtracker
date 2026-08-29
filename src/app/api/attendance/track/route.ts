import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { haversineMeters, isPlausibleStep } from "@/lib/utils";
import { autoPunchOutIfStale, closeOpenAttendance } from "@/lib/punchOut";
import { assertInsideCallCenterSite, isCallCenterDesignation } from "@/lib/callCenterGeofence";
import { isPanIndiaPunchPhone } from "@/lib/panIndiaPunch";

export async function POST(req: Request) {
  const s = await requireUser();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const closed = await autoPunchOutIfStale(s.sub).catch(() => null);
  if (closed) {
    return NextResponse.json(
      { error: "Session auto punched out after 12 hours.", code: "AUTO_12H", attendance: closed },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => null);
  const points = Array.isArray(body?.points) ? body.points : [];
  const open = await prisma.attendance.findFirst({
    where: { userId: s.sub, punchOutAt: null },
    include: { points: { orderBy: { recordedAt: "desc" }, take: 1 } },
  });
  if (!open) return NextResponse.json({ error: "No active session." }, { status: 400 });
  if (Date.now() - open.punchInAt.getTime() >= 12 * 60 * 60 * 1000) {
    void autoPunchOutIfStale(s.sub).catch(() => {});
    return NextResponse.json(
      { error: "Session auto punched out after 12 hours.", code: "AUTO_12H" },
      { status: 409 }
    );
  }

  const cleaned: { lat: number; lng: number; recordedAt: Date; accuracy: number | null }[] = [];
  let prev = open.points[0] ? { lat: open.points[0].lat, lng: open.points[0].lng } : null;
  for (const p of points.slice(0, 80)) {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const next = { lat, lng };
    if (prev && !isPlausibleStep(prev, next, Number(p.accuracy))) continue;
    prev = next;
    cleaned.push({
      lat,
      lng,
      recordedAt: p.recordedAt ? new Date(p.recordedAt) : new Date(),
      accuracy: Number.isFinite(Number(p.accuracy)) ? Number(p.accuracy) : null,
    });
  }
  if (!cleaned.length) return NextResponse.json({ ok: true });

  const user = await prisma.user.findUnique({
    where: { id: s.sub },
    select: { designation: true, sectorAllotted: true, phone: true },
  });
  if (isCallCenterDesignation(user?.designation) && !isPanIndiaPunchPhone(user?.phone)) {
    for (const p of cleaned) {
      const geo = assertInsideCallCenterSite({
        sectorAllotted: user?.sectorAllotted,
        lat: p.lat,
        lng: p.lng,
      });
      if (!geo.ok) {
        const attendance = await closeOpenAttendance({
          userId: s.sub,
          lat: p.lat,
          lng: p.lng,
          accuracy: p.accuracy,
          reason: "auto_geofence",
          address: geo.error,
        });
        return NextResponse.json(
          {
            error: geo.error,
            code: "AUTO_GEOFENCE",
            attendance,
          },
          { status: 409 }
        );
      }
    }
  }

  await prisma.trackPoint.createMany({
    data: cleaned.map((p) => ({ ...p, attendanceId: open.id })),
  });

  let extra = 0;
  prev = open.points[0] ? { lat: open.points[0].lat, lng: open.points[0].lng } : null;
  for (const p of cleaned) {
    if (prev) extra += haversineMeters(prev, p);
    prev = p;
  }
  await prisma.attendance.update({
    where: { id: open.id },
    data: { distanceMeters: { increment: extra } },
  });

  return NextResponse.json({ ok: true });
}
