import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionTravelMeters, shouldCreditTrackStep } from "@/lib/utils";
import { autoPunchOutIfStale, closeOpenAttendance } from "@/lib/punchOut";
import { assertInsideCallCenterSite, isCallCenterDesignation } from "@/lib/callCenterGeofence";
import { mergeMapProbeLog } from "@/lib/gpsSpoofVerdict";
import { isPanIndiaPunchPhone } from "@/lib/panIndiaPunch";

export async function POST(req: Request) {
  const s = await requireUser(req);
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
  const mapGpsSpreadM = Number(body?.mapGpsSpreadM);
  const mapProbesRaw = Array.isArray(body?.mapProbes) ? body.mapProbes : [];
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
    if (!shouldCreditTrackStep(prev, next, Number(p.accuracy), dt)) continue;
    prev = { ...next, at };
    cleaned.push({
      lat,
      lng,
      recordedAt,
      accuracy: Number.isFinite(Number(p.accuracy)) ? Number(p.accuracy) : null,
    });
  }
  const incomingMapProbes = mapProbesRaw
    .slice(0, 40)
    .map((p: { lat?: number; lng?: number; accuracy?: number; at?: number }) => ({
      lat: Number(p.lat),
      lng: Number(p.lng),
      accuracy: Number.isFinite(Number(p.accuracy)) ? Number(p.accuracy) : null,
      at: Number.isFinite(Number(p.at)) ? Number(p.at) : Date.now(),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

  const hbLat = Number(body?.heartbeat?.lat);
  const hbLng = Number(body?.heartbeat?.lng);
  const hasHeartbeat = Number.isFinite(hbLat) && Number.isFinite(hbLng);

  if (!cleaned.length && !Number.isFinite(mapGpsSpreadM) && !incomingMapProbes.length && !hasHeartbeat) {
    return NextResponse.json({ ok: true });
  }

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

  if (cleaned.length) {
    await prisma.trackPoint.createMany({
      data: cleaned.map((p) => ({ ...p, attendanceId: open.id })),
    });
  }

  const spreadUpdate: {
    distanceMeters?: number;
    gpsMapSpreadM?: number;
    gpsMapProbeLog?: ReturnType<typeof mergeMapProbeLog>;
    lastKnownLat?: number;
    lastKnownLng?: number;
    lastKnownAt?: Date;
  } = {};
  if (Number.isFinite(mapGpsSpreadM) && mapGpsSpreadM > (open.gpsMapSpreadM ?? 0)) {
    spreadUpdate.gpsMapSpreadM = mapGpsSpreadM;
  }
  if (incomingMapProbes.length) {
    spreadUpdate.gpsMapProbeLog = mergeMapProbeLog(open.gpsMapProbeLog, incomingMapProbes);
  }

  if (cleaned.length) {
    const allPoints = await prisma.trackPoint.findMany({
      where: { attendanceId: open.id },
      orderBy: { recordedAt: "asc" },
      select: { lat: true, lng: true, recordedAt: true, accuracy: true },
    });
    spreadUpdate.distanceMeters = sessionTravelMeters({
      punchIn: { lat: open.punchInLat, lng: open.punchInLng },
      punchInAt: open.punchInAt,
      points: allPoints,
    });
    const last = cleaned[cleaned.length - 1];
    spreadUpdate.lastKnownLat = last.lat;
    spreadUpdate.lastKnownLng = last.lng;
    spreadUpdate.lastKnownAt = last.recordedAt;
  } else if (hasHeartbeat) {
    spreadUpdate.lastKnownLat = hbLat;
    spreadUpdate.lastKnownLng = hbLng;
    spreadUpdate.lastKnownAt = new Date();
  }

  if (Object.keys(spreadUpdate).length) {
    await prisma.attendance.update({
      where: { id: open.id },
      data: spreadUpdate,
    });
  }

  return NextResponse.json({ ok: true });
}
