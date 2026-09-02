import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeFaceImage } from "@/lib/faceImage";
import { assertInsideAssignedAssembly } from "@/lib/assemblyGeofence";
import { assertInsideCallCenterSite, isCallCenterDesignation } from "@/lib/callCenterGeofence";
import { closeOpenAttendance } from "@/lib/punchOut";
import { requireUserFaceMatch } from "@/lib/requireFaceMatch";
import { assertPanIndiaPunchLocation, isPanIndiaPunchPhone } from "@/lib/panIndiaPunch";
import { enforceGpsAntiSpoof, flagStationarySession } from "@/lib/gpsAntiSpoof";

export async function POST(req: Request) {
  const s = await requireUser();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const address = typeof body?.address === "string" ? body.address.slice(0, 200) : null;
  const punchOutFace = sanitizeFaceImage(body?.image);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Location is required for punch out." }, { status: 400 });
  }

  const face = await requireUserFaceMatch(s.sub, body?.descriptor);
  if (!face.ok) {
    return NextResponse.json({ error: face.error, code: "FACE_MISMATCH" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: s.sub },
    select: {
      name: true,
      phone: true,
      zone: true,
      district: true,
      assemblyName: true,
      designation: true,
      assemblies: true,
      sectorAllotted: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Account not found." }, { status: 403 });

  const gpsCheck = await enforceGpsAntiSpoof({
    userId: s.sub,
    user: {
      name: user.name,
      phone: user.phone,
      designation: user.designation,
      assemblyName: user.assemblyName,
      zone: user.zone,
      district: user.district,
    },
    action: "punch_out",
    lat,
    lng,
    accuracy: Number.isFinite(Number(body?.accuracy)) ? Number(body.accuracy) : null,
    gpsSamples: body?.gpsSamples,
  });
  if (!gpsCheck.ok) {
    return NextResponse.json({ error: gpsCheck.error, code: gpsCheck.code }, { status: 403 });
  }

  if (isPanIndiaPunchPhone(user?.phone)) {
    const india = assertPanIndiaPunchLocation(lat, lng);
    if (!india.ok) {
      return NextResponse.json({ error: india.error, code: india.code }, { status: 403 });
    }
  } else if (isCallCenterDesignation(user?.designation)) {
    const geo = assertInsideCallCenterSite({
      sectorAllotted: user?.sectorAllotted,
      lat,
      lng,
    });
    if (!geo.ok) {
      return NextResponse.json({ error: geo.error, code: geo.code }, { status: 403 });
    }
  } else {
    const geo = assertInsideAssignedAssembly({
      assemblyName: user?.assemblyName,
      assemblies: user?.assemblies,
      designation: user?.designation,
      lat,
      lng,
    });
    if (!geo.ok) {
      return NextResponse.json({ error: geo.error, code: geo.code }, { status: 403 });
    }
  }

  const attendance = await closeOpenAttendance({
    userId: s.sub,
    lat,
    lng,
    address,
    accuracy: Number.isFinite(Number(body?.accuracy)) ? Number(body.accuracy) : null,
    reason: "manual",
    punchOutFace,
  });
  if (!attendance) return NextResponse.json({ error: "No active punch in." }, { status: 400 });

  void flagStationarySession({
    userId: s.sub,
    user: {
      name: user.name,
      phone: user.phone,
      designation: user.designation,
      assemblyName: user.assemblyName,
      zone: user.zone,
      district: user.district,
    },
    attendanceId: attendance.id,
    punchInAt: attendance.punchInAt,
    punchOutAt: attendance.punchOutAt || new Date(),
    distanceMeters: attendance.distanceMeters,
    lat,
    lng,
  });

  return NextResponse.json({ attendance, ok: true });
}
