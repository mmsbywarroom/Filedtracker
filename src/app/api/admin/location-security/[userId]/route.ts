import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Ctx = { params: { userId: string } };

/** Admin-only employee identity + full integrity timeline/evidence. */
export async function GET(req: Request, ctx: Ctx) {
  const s = await requireSuperAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = ctx.params.userId;
  const url = new URL(req.url);
  const attendanceSessionId = url.searchParams.get("attendanceSessionId") || "";
  const punchId = url.searchParams.get("punchId") || "";

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      phone: true,
      designation: true,
      assemblyName: true,
      assemblies: true,
      sectorAllotted: true,
      zone: true,
      district: true,
      cluster: true,
      isActive: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const teamParts = [user.zone, user.district, user.cluster || user.assemblyName].filter(Boolean);

  const summaryWhere = {
    userId,
    ...(punchId ? { punchId } : {}),
    ...(attendanceSessionId ? { attendanceId: attendanceSessionId } : {}),
  };
  const eventWhere = {
    userId,
    ...(punchId ? { punchId } : {}),
    ...(attendanceSessionId ? { attendanceId: attendanceSessionId } : {}),
  };
  const sampleWhere = {
    userId,
    ...(punchId ? { punchId } : {}),
    ...(attendanceSessionId ? { attendanceId: attendanceSessionId } : {}),
  };

  const [summaries, events, samples, devices, attendance] = await Promise.all([
    prisma.attendanceSecuritySummary.findMany({
      where: summaryWhere,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.attendanceSecurityEvent.findMany({
      where: eventWhere,
      orderBy: { eventTimestamp: "desc" },
      take: 200,
    }),
    prisma.attendanceLocationSample.findMany({
      where: sampleWhere,
      orderBy: { locationTimestamp: "desc" },
      take: 300,
    }),
    prisma.deviceAppInstallation.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
    }),
    prisma.attendance.findMany({
      where: {
        userId,
        ...(attendanceSessionId ? { id: attendanceSessionId } : {}),
      },
      orderBy: { punchInAt: "desc" },
      take: attendanceSessionId ? 1 : 20,
      select: {
        id: true,
        punchInAt: true,
        punchOutAt: true,
        punchInLat: true,
        punchInLng: true,
        punchOutLat: true,
        punchOutLng: true,
        punchInClient: true,
        punchOutClient: true,
      },
    }),
  ]);

  const mockEvents = events.filter(
    (e) => e.eventType === "MOCK_LOCATION_OS_SIGNAL" || e.isMock
  );
  const mockSampleCount = samples.filter((s) => s.isMock).length;
  const mockLocationEventCount = Math.max(mockSampleCount, mockEvents.length);
  const firstSuspiciousAt = mockEvents.length
    ? mockEvents.reduce(
        (min, e) => (e.eventTimestamp < min ? e.eventTimestamp : min),
        mockEvents[0].eventTimestamp
      )
    : samples
        .filter((s) => s.isMock)
        .reduce<Date | null>((min, s) => {
          if (!min || s.locationTimestamp < min) return s.locationTimestamp;
          return min;
        }, null);
  const lastSuspiciousAt = mockEvents.length
    ? mockEvents.reduce(
        (max, e) => (e.eventTimestamp > max ? e.eventTimestamp : max),
        mockEvents[0].eventTimestamp
      )
    : samples
        .filter((s) => s.isMock)
        .reduce<Date | null>((max, s) => {
          if (!max || s.locationTimestamp > max) return s.locationTimestamp;
          return max;
        }, null);

  const primaryAttendance = attendance[0] || null;
  const primarySummary = summaries[0] || null;
  const primaryDevice = devices[0] || null;
  const securityStatus =
    mockLocationEventCount > 0
      ? "DIRECT_MOCK_SIGNAL"
      : primarySummary?.securityStatus || "NORMAL";
  const riskScore =
    mockLocationEventCount > 0
      ? Math.max(primarySummary?.riskScore || 0, 100)
      : primarySummary?.riskScore || 0;

  return NextResponse.json({
    employee: {
      employeeId: user.id,
      employeeName: user.name,
      mobileNumber: user.phone,
      designation: user.designation,
      department: user.zone || "",
      team: teamParts.join(" · "),
      assemblyName: user.assemblyName,
      assemblies: user.assemblies,
      sectorAllotted: user.sectorAllotted,
      zone: user.zone,
      district: user.district,
      cluster: user.cluster,
      isActive: user.isActive,
    },
    // Back-compat for older UI keys
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      designation: user.designation,
      assemblyName: user.assemblyName,
      zone: user.zone,
      district: user.district,
      cluster: user.cluster,
    },
    session: {
      attendanceSessionId: primaryAttendance?.id || primarySummary?.attendanceId || null,
      punchId: primarySummary?.punchId || punchId || null,
      punchType: primarySummary?.punchType || null,
      punchInAt: primaryAttendance?.punchInAt?.toISOString() || null,
      punchOutAt: primaryAttendance?.punchOutAt?.toISOString() || null,
      securityStatus,
      riskScore,
      mockLocationEventCount,
      firstSuspiciousAt: firstSuspiciousAt ? firstSuspiciousAt.toISOString() : null,
      lastSuspiciousAt: lastSuspiciousAt ? lastSuspiciousAt.toISOString() : null,
      deviceModel: primaryDevice
        ? `${primaryDevice.manufacturer} ${primaryDevice.model}`.trim()
        : "",
      appInstallationId:
        primarySummary?.appInstallationId || primaryDevice?.appInstallationId || "",
    },
    summaries,
    events,
    samples: samples.map((x) => ({
      ...x,
      marker: x.isMock ? "mock" : "normal",
      markerLabel: x.isMock ? "Android OS reported this location as mock" : "normal",
    })),
    devices,
    attendance,
  });
}
