import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Admin-only session risk list with employee identity (joined from User/Attendance). */
export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const status = url.searchParams.get("status") || "";

  const createdAt: { gte?: Date; lte?: Date } = {};
  if (from) createdAt.gte = new Date(`${from}T00:00:00+05:30`);
  if (to) createdAt.lte = new Date(`${to}T23:59:59+05:30`);

  const summaries = await prisma.attendanceSecuritySummary.findMany({
    where: {
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
      ...(status ? { securityStatus: status } : {}),
    },
    orderBy: [{ riskScore: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

  const userIds = Array.from(new Set(summaries.map((x) => x.userId)));
  const attendanceIds = Array.from(
    new Set(summaries.map((x) => x.attendanceId).filter((id): id is string => Boolean(id)))
  );
  const punchIds = summaries.map((x) => x.punchId);

  const [users, attendances, devices, mockEvents] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        name: true,
        phone: true,
        designation: true,
        assemblyName: true,
        zone: true,
        district: true,
        cluster: true,
        sectorAllotted: true,
      },
    }),
    attendanceIds.length
      ? prisma.attendance.findMany({
          where: { id: { in: attendanceIds } },
          select: { id: true, punchInAt: true, punchOutAt: true },
        })
      : Promise.resolve([]),
    userIds.length
      ? prisma.deviceAppInstallation.findMany({
          where: { userId: { in: userIds } },
          orderBy: { lastSeenAt: "desc" },
        })
      : Promise.resolve([]),
    punchIds.length
      ? prisma.attendanceSecurityEvent.findMany({
          where: {
            punchId: { in: punchIds },
            OR: [{ eventType: "MOCK_LOCATION_OS_SIGNAL" }, { isMock: true }],
          },
          select: { punchId: true, eventTimestamp: true, isMock: true, eventType: true },
          orderBy: { eventTimestamp: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const byUser = new Map(users.map((u) => [u.id, u]));
  const byAttendance = new Map(attendances.map((a) => [a.id, a]));
  const latestDeviceByUser = new Map<string, (typeof devices)[0]>();
  for (const d of devices) {
    if (!latestDeviceByUser.has(d.userId)) latestDeviceByUser.set(d.userId, d);
  }

  type PunchAgg = {
    count: number;
    first: Date | null;
    last: Date | null;
  };
  const mockByPunch = new Map<string, PunchAgg>();
  for (const ev of mockEvents) {
    if (!ev.punchId) continue;
    const cur = mockByPunch.get(ev.punchId) || { count: 0, first: null, last: null };
    cur.count += 1;
    if (!cur.first || ev.eventTimestamp < cur.first) cur.first = ev.eventTimestamp;
    if (!cur.last || ev.eventTimestamp > cur.last) cur.last = ev.eventTimestamp;
    mockByPunch.set(ev.punchId, cur);
  }

  const rows = summaries.map((row) => {
    const u = byUser.get(row.userId);
    const att = row.attendanceId ? byAttendance.get(row.attendanceId) : undefined;
    const device = latestDeviceByUser.get(row.userId);
    const mock = mockByPunch.get(row.punchId);
    const mockLocationEventCount = Math.max(row.directMockSampleCount, mock?.count || 0);
    const suspicious =
      row.securityStatus !== "NORMAL" || row.mockLocationDetected || mockLocationEventCount > 0;
    const firstSuspicious =
      mock?.first?.toISOString() ||
      (suspicious ? row.createdAt.toISOString() : null);
    const lastSuspicious =
      mock?.last?.toISOString() ||
      (suspicious ? row.updatedAt.toISOString() : null);

    const teamParts = [u?.zone, u?.district, u?.cluster || u?.assemblyName].filter(Boolean);

    return {
      employeeId: row.userId,
      employeeName: u?.name || "",
      mobileNumber: u?.phone || "",
      designation: u?.designation || "",
      department: u?.zone || "",
      team: teamParts.join(" · ") || u?.assemblyName || "",
      assemblyName: u?.assemblyName || "",
      zone: u?.zone || "",
      district: u?.district || "",
      cluster: u?.cluster || "",
      sectorAllotted: u?.sectorAllotted || "",
      attendanceSessionId: row.attendanceId || null,
      punchId: row.punchId,
      punchType: row.punchType,
      punchInAt: att?.punchInAt?.toISOString() || null,
      punchOutAt: att?.punchOutAt?.toISOString() || null,
      deviceModel: device ? `${device.manufacturer} ${device.model}`.trim() : "",
      appInstallationId: row.appInstallationId || device?.appInstallationId || "",
      appVersion: device?.appVersion || "",
      securityStatus: row.securityStatus,
      riskScore: row.riskScore,
      mockLocationEventCount,
      mockLocationDetected: row.mockLocationDetected,
      firstSuspiciousAt: firstSuspicious,
      lastSuspiciousAt: lastSuspicious,
      summaryCreatedAt: row.createdAt.toISOString(),
    };
  });

  return NextResponse.json({ rows });
}
