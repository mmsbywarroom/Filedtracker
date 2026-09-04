import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { parseClientSource } from "@/lib/clientSource";
import { punchInWindowMessage } from "@/lib/punchInWindow";
import { canUserPunchIn, punchInDeniedMessage, punchInReentryMessage } from "@/lib/punchReentry";
import { prisma } from "@/lib/prisma";
import { downsample, sessionTravelMeters } from "@/lib/utils";
import { sanitizeFaceImage } from "@/lib/faceImage";
import { assertInsideAssignedAssembly } from "@/lib/assemblyGeofence";
import { assertInsideCallCenterSite, isCallCenterDesignation } from "@/lib/callCenterGeofence";
import { autoPunchOutIfStale, closeStaleSessionForRePunch } from "@/lib/punchOut";
import { resolveAndMatchPunchFace } from "@/lib/resolvePunchFace";
import { findHolidayToday, holidayAppliesTo } from "@/lib/holidays";
import { assertPanIndiaPunchLocation, isPanIndiaPunchPhone } from "@/lib/panIndiaPunch";
import { hoursWorkedOnDay } from "@/lib/dailyAttendance";

function istDayBounds(d = new Date()) {
  const ymd = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return {
    start: new Date(`${ymd}T00:00:00+05:30`),
    end: new Date(`${ymd}T23:59:59.999+05:30`),
  };
}

export async function GET(req: Request) {
  const s = await requireUser(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Don't block dashboard open on auto punch-out (can lock DB under load)
  void autoPunchOutIfStale(s.sub).catch(() => {});
  // Do NOT close idle sessions here — screen off stops track points but GPS is still on.

  const open = await prisma.attendance.findFirst({
    where: { userId: s.sub, punchOutAt: null },
    include: { points: { orderBy: { recordedAt: "desc" }, take: 400 } },
    orderBy: { punchInAt: "desc" },
  });
  // If session is already past 12h, hide as closed even if background close is still running
  const openFresh =
    open && Date.now() - open.punchInAt.getTime() < 12 * 60 * 60 * 1000 ? open : null;
  if (open && !openFresh) {
    void autoPunchOutIfStale(s.sub).catch(() => {});
  }

  let intervalSnapshotsDone: number[] = [];
  if (openFresh) {
    const snaps = await prisma.attendanceIntervalSnapshot.findMany({
      where: { attendanceId: openFresh.id },
      select: { slot: true },
    });
    intervalSnapshotsDone = snaps.map((p) => p.slot);
  }

  const history = await prisma.attendance.findMany({
    where: { userId: s.sub },
    orderBy: { punchInAt: "desc" },
    take: 1,
  });
  const { start, end } = istDayBounds();
  const todayRows = await prisma.attendance.findMany({
    where: { userId: s.sub, punchInAt: { gte: start, lte: end } },
    select: {
      id: true,
      distanceMeters: true,
      punchInAt: true,
      punchInLat: true,
      punchInLng: true,
      punchOutLat: true,
      punchOutLng: true,
      punchOutAt: true,
    },
  });
  const mapId = openFresh?.id || history[0]?.id;
  const openPts = [...(openFresh?.points || [])].reverse();
  let mapPoints: { lat: number; lng: number; recordedAt: Date }[] = [];
  if (openFresh && openFresh.id === mapId) {
    mapPoints = downsample(openPts, 280);
  } else if (mapId) {
    const pts = await prisma.trackPoint.findMany({
      where: { attendanceId: mapId },
      orderBy: { recordedAt: "desc" },
      take: 400,
    });
    mapPoints = downsample([...pts].reverse(), 280);
  }

  const openDistance = openFresh
    ? sessionTravelMeters({
        stored: openFresh.distanceMeters,
        punchIn: { lat: openFresh.punchInLat, lng: openFresh.punchInLng },
        punchInAt: openFresh.punchInAt,
        points: openPts.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          recordedAt: p.recordedAt,
          accuracy: p.accuracy,
        })),
        punchOut:
          openFresh.punchOutLat != null && openFresh.punchOutLng != null
            ? { lat: openFresh.punchOutLat, lng: openFresh.punchOutLng }
            : null,
        punchOutAt: openFresh.punchOutAt,
      })
    : 0;

  const todayDistanceMeters = todayRows.reduce((sum, r) => {
    if (openFresh && r.id === openFresh.id) return sum + openDistance;
    return (
      sum +
      sessionTravelMeters({
        stored: r.distanceMeters,
        punchIn: { lat: r.punchInLat, lng: r.punchInLng },
        punchInAt: r.punchInAt,
        punchOut:
          r.punchOutLat != null && r.punchOutLng != null
            ? { lat: r.punchOutLat, lng: r.punchOutLng }
            : null,
        punchOutAt: r.punchOutAt,
      })
    );
  }, 0);

  const punchGate = await canUserPunchIn(s.sub, s.phone);
  const todayHours = hoursWorkedOnDay(
    todayRows.map((r) => ({ punchInAt: r.punchInAt, punchOutAt: r.punchOutAt })),
    new Date()
  );
  const priorClosedMs = todayRows.reduce((sum, r) => {
    if (!r.punchOutAt) return sum;
    if (openFresh && r.id === openFresh.id) return sum;
    return sum + Math.max(0, r.punchOutAt.getTime() - r.punchInAt.getTime());
  }, 0);

  return NextResponse.json({
    open: openFresh
      ? {
          ...openFresh,
          points: mapPoints,
          distanceMeters: openDistance,
          intervalSnapshotsDone,
        }
      : null,
    todayDistanceMeters,
    todayHoursWorked: Math.round(todayHours * 10) / 10,
    todayPriorClosedMs: priorClosedMs,
    history: history.map((h) => ({ ...h, points: h.id === mapId ? mapPoints : [] })),
    punchInAllowed: punchGate.allowed,
    punchInAllowedReason: punchGate.reason,
    punchInWindowMessage:
      punchGate.reason === "reentry" ? punchInReentryMessage() : punchInWindowMessage(),
  });
}

export async function POST(req: Request) {
  const s = await requireUser(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await autoPunchOutIfStale(s.sub);
  // If old session had no updates for 45+ min, close it so this punch-in can start fresh
  await closeStaleSessionForRePunch(s.sub);

  const body = await req.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const address = typeof body?.address === "string" ? body.address.slice(0, 200) : null;
  const punchInFace = sanitizeFaceImage(body?.image);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Location is required for punch in." }, { status: 400 });
  }

  const face = await resolveAndMatchPunchFace(s.sub, body?.descriptor, body?.image);
  if (!face.ok) {
    return NextResponse.json({ error: face.error, code: "FACE_MISMATCH" }, { status: 403 });
  }

  const existing = await prisma.attendance.findFirst({
    where: { userId: s.sub, punchOutAt: null },
  });
  if (existing) return NextResponse.json({ error: "Already punched in." }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: s.sub },
    select: {
      name: true,
      phone: true,
      zone: true,
      district: true,
      assemblyName: true,
      designation: true,
      isActive: true,
      assemblies: true,
      sectorAllotted: true,
    },
  });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Account not found or inactive." }, { status: 403 });
  }

  const { start, end } = istDayBounds();
  const onLeave = await prisma.leaveRequest.findFirst({
    where: {
      userId: s.sub,
      status: "approved",
      fromDate: { lte: end },
      toDate: { gte: start },
    },
    select: { id: true },
  });
  if (onLeave) {
    return NextResponse.json(
      { error: "You are on approved leave today. Punch in is not allowed." },
      { status: 403 }
    );
  }
  const punchGate = await canUserPunchIn(s.sub, user.phone);
  if (!punchGate.allowed) {
    return NextResponse.json({ error: punchInDeniedMessage(), code: "PUNCH_IN_WINDOW" }, { status: 403 });
  }
  const holiday = await findHolidayToday();
  if (holiday && holidayAppliesTo(holiday, user.designation)) {
    return NextResponse.json(
      {
        error: `Today is a holiday for ${user.designation} (${holiday.reason}). Punch in is not required.`,
      },
      { status: 403 }
    );
  }

  if (isPanIndiaPunchPhone(user.phone)) {
    const india = assertPanIndiaPunchLocation(lat, lng);
    if (!india.ok) {
      return NextResponse.json({ error: india.error, code: india.code }, { status: 403 });
    }
  } else if (isCallCenterDesignation(user.designation)) {
    const geo = assertInsideCallCenterSite({
      sectorAllotted: user.sectorAllotted,
      lat,
      lng,
    });
    if (!geo.ok) {
      return NextResponse.json({ error: geo.error, code: geo.code }, { status: 403 });
    }
  } else {
    const geo = assertInsideAssignedAssembly({
      assemblyName: user.assemblyName,
      assemblies: user.assemblies,
      designation: user.designation,
      lat,
      lng,
    });
    if (!geo.ok) {
      return NextResponse.json({ error: geo.error, code: geo.code }, { status: 403 });
    }
  }

  const attendance = await prisma.attendance.create({
    data: {
      userId: s.sub,
      punchInAt: new Date(),
      punchInLat: lat,
      punchInLng: lng,
      punchInAddress:
        punchGate.reason === "reentry"
          ? [address, "Re-entry after early punch-out (hours joined with morning session)"]
              .filter(Boolean)
              .join(" · ")
              .slice(0, 200)
          : address,
      punchInFace,
      punchInClient: parseClientSource(req),
      lastKnownLat: lat,
      lastKnownLng: lng,
      lastKnownAt: new Date(),
      points: {
        create: { lat, lng, recordedAt: new Date(), accuracy: Number(body?.accuracy) || null },
      },
    },
    select: { id: true, punchInAt: true },
  });

  return NextResponse.json({
    attendance: { ...attendance, intervalSnapshotsDone: [] },
    ok: true,
    reentry: punchGate.reason === "reentry",
  });
}
