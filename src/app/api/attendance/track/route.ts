import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPlausibleStep, sessionTravelMeters } from "@/lib/utils";
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
  let prev = open.points[0]
    ? { lat: open.points[0].lat, lng: open.points[0].lng, at: open.points[0].recordedAt.getTime() }
    : { lat: open.punchInLat, lng: open.punchInLng, at: open.punchInAt.getTime() };
  for (const p of points.slice(0, 80)) {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const recordedAt = p.recordedAt ? new Date(p.recordedAt) : new Date();
    const at = Number.isFinite(recordedAt.getTime()) ? recordedAt.getTime() : Date.now();
    const next = { lat, lng };
    const dt = Math.max(0, at - prev.at);
    if (!isPlausibleStep(prev, next, Number(p.accuracy), dt)) continue;
    prev = { ...next, at };
    cleaned.push({
      lat,
      lng,
      recordedAt,
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

  const allPoints = await prisma.trackPoint.findMany({
    where: { attendanceId: open.id },
    orderBy: { recordedAt: "asc" },
    select: { lat: true, lng: true, recordedAt: true, accuracy: true },
  });
  const distanceMeters = sessionTravelMeters({
    punchIn: { lat: open.punchInLat, lng: open.punchInLng },
    punchInAt: open.punchInAt,
    points: allPoints,
  });
  await prisma.attendance.update({
    where: { id: open.id },
    data: { distanceMeters },
  });

  return NextResponse.json({ ok: true });
}
