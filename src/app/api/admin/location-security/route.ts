import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeRiskScore } from "@/lib/locationIntegrity/riskScore";

type DateRange = { gte?: Date; lte?: Date };

/**
 * Admin list (super admin only).
 * Default (view=mock|empty): ONLY attendance sessions with direct Android mock-GPS evidence.
 * Optional view=all: other security activity (VPN/integrity/heuristics) — not mixed into main table.
 */
export async function GET(req: Request) {
  const s = await requireSuperAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const view = (url.searchParams.get("view") || "mock").toLowerCase();

  const range: DateRange = {};
  if (from) range.gte = new Date(`${from}T00:00:00+05:30`);
  if (to) range.lte = new Date(`${to}T23:59:59+05:30`);

  if (view === "all") {
    return NextResponse.json({ rows: await buildAllActivityRows(range), view: "all" });
  }

  return NextResponse.json({ rows: await buildMockOnlyRows(range), view: "mock" });
}

async function buildMockOnlyRows(range: DateRange) {
  const tsFilter = Object.keys(range).length ? range : undefined;

  const [mockSamples, mockEvents] = await Promise.all([
    prisma.attendanceLocationSample.findMany({
      where: {
        isMock: true,
        ...(tsFilter ? { locationTimestamp: tsFilter } : {}),
      },
      select: {
        userId: true,
        attendanceId: true,
        punchId: true,
        locationTimestamp: true,
        appInstallationId: true,
      },
      orderBy: { locationTimestamp: "desc" },
      take: 5000,
    }),
    prisma.attendanceSecurityEvent.findMany({
      where: {
        eventType: "MOCK_LOCATION_OS_SIGNAL",
        ...(tsFilter ? { eventTimestamp: tsFilter } : {}),
      },
      select: {
        eventId: true,
        userId: true,
        attendanceId: true,
        punchId: true,
        eventTimestamp: true,
        appInstallationId: true,
      },
      orderBy: { eventTimestamp: "desc" },
      take: 5000,
    }),
  ]);

  type SessionKey = string;
  type Agg = {
    userId: string;
    attendanceId: string | null;
    punchId: string | null;
    mockCount: number;
    firstMockAt: Date;
    lastMockAt: Date;
    appInstallationId: string;
  };

  const bySession = new Map<SessionKey, Agg>();

  function sessionKey(attendanceId: string | null, punchId: string | null, userId: string) {
    if (attendanceId) return `att:${attendanceId}`;
    if (punchId) return `punch:${punchId}`;
    return `user:${userId}:orphan`;
  }

  function addEvidence(
    userId: string,
    attendanceId: string | null,
    punchId: string | null,
    at: Date,
    appInstallationId: string,
    incrementCount: boolean
  ) {
    const key = sessionKey(attendanceId, punchId, userId);
    const cur = bySession.get(key);
    if (!cur) {
      bySession.set(key, {
        userId,
        attendanceId,
        punchId,
        mockCount: incrementCount ? 1 : 0,
        firstMockAt: at,
        lastMockAt: at,
        appInstallationId: appInstallationId || "",
      });
      return;
    }
    if (incrementCount) cur.mockCount += 1;
    if (at < cur.firstMockAt) cur.firstMockAt = at;
    if (at > cur.lastMockAt) cur.lastMockAt = at;
    if (!cur.attendanceId && attendanceId) cur.attendanceId = attendanceId;
    if (!cur.punchId && punchId) cur.punchId = punchId;
    if (!cur.appInstallationId && appInstallationId) cur.appInstallationId = appInstallationId;
  }

  for (const s of mockSamples) {
    addEvidence(s.userId, s.attendanceId, s.punchId, s.locationTimestamp, s.appInstallationId, true);
  }
  for (const e of mockEvents) {
    if (!e.attendanceId && !e.punchId) continue;
    const key = sessionKey(e.attendanceId, e.punchId, e.userId);
    const already = bySession.has(key);
    addEvidence(
      e.userId,
      e.attendanceId,
      e.punchId,
      e.eventTimestamp,
      e.appInstallationId,
      !already
    );
  }

  const sessions = Array.from(bySession.values()).filter(
    (x) => (x.attendanceId || x.punchId) && x.mockCount > 0
  );
  if (!sessions.length) return [];

  const userIds = Array.from(new Set(sessions.map((x) => x.userId)));
  const attendanceIds = Array.from(
    new Set(sessions.map((x) => x.attendanceId).filter((id): id is string => Boolean(id)))
  );
  const punchIds = Array.from(
    new Set(sessions.map((x) => x.punchId).filter((id): id is string => Boolean(id)))
  );

  const [users, attendances, summaries, devices] = await Promise.all([
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
    punchIds.length || attendanceIds.length
      ? prisma.attendanceSecuritySummary.findMany({
          where: {
            OR: [
              ...(punchIds.length ? [{ punchId: { in: punchIds } }] : []),
              ...(attendanceIds.length ? [{ attendanceId: { in: attendanceIds } }] : []),
            ],
          },
        })
      : Promise.resolve([]),
    userIds.length
      ? prisma.deviceAppInstallation.findMany({
          where: { userId: { in: userIds } },
          orderBy: { lastSeenAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const byUser = new Map(users.map((u) => [u.id, u]));
  const byAttendance = new Map(attendances.map((a) => [a.id, a]));
  const summaryByPunch = new Map(summaries.map((s) => [s.punchId, s]));
  const summaryByAttendance = new Map<string, (typeof summaries)[0]>();
  for (const s of summaries) {
    if (s.attendanceId && !summaryByAttendance.has(s.attendanceId)) {
      summaryByAttendance.set(s.attendanceId, s);
    }
  }
  const latestDeviceByUser = new Map<string, (typeof devices)[0]>();
  for (const d of devices) {
    if (!latestDeviceByUser.has(d.userId)) latestDeviceByUser.set(d.userId, d);
  }

  const rows = sessions.map((sess) => {
    const u = byUser.get(sess.userId);
    const att = sess.attendanceId ? byAttendance.get(sess.attendanceId) : undefined;
    const summary =
      (sess.punchId && summaryByPunch.get(sess.punchId)) ||
      (sess.attendanceId && summaryByAttendance.get(sess.attendanceId)) ||
      null;
    const device = latestDeviceByUser.get(sess.userId);
    const teamParts = [u?.zone, u?.district, u?.cluster || u?.assemblyName].filter(Boolean);

    const risk =
      summary && summary.mockLocationDetected
        ? {
            riskScore: summary.riskScore,
            securityStatus: "DIRECT_MOCK_SIGNAL" as const,
          }
        : computeRiskScore({
            directMockSampleCount: sess.mockCount,
            playIntegrityFailed: false,
            playIntegrityStrongTamper: false,
            impossibleTravelCount: 0,
            teleportPatternCount: 0,
            sensorMismatchCount: 0,
            vpnActive: false,
          });

    return {
      employeeId: sess.userId,
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
      attendanceSessionId: sess.attendanceId || summary?.attendanceId || null,
      punchId: sess.punchId || summary?.punchId || "",
      punchType: summary?.punchType || "session",
      punchInAt: att?.punchInAt?.toISOString() || null,
      punchOutAt: att?.punchOutAt?.toISOString() || null,
      deviceModel: device ? `${device.manufacturer} ${device.model}`.trim() : "",
      appInstallationId:
        sess.appInstallationId || summary?.appInstallationId || device?.appInstallationId || "",
      appVersion: device?.appVersion || "",
      securityStatus: "DIRECT_MOCK_SIGNAL" as const,
      riskScore: Math.max(risk.riskScore, 100),
      mockLocationEventCount: Math.max(sess.mockCount, summary?.directMockSampleCount || 0),
      mockLocationDetected: true,
      firstMockAt: sess.firstMockAt.toISOString(),
      lastMockAt: sess.lastMockAt.toISOString(),
      firstSuspiciousAt: sess.firstMockAt.toISOString(),
      lastSuspiciousAt: sess.lastMockAt.toISOString(),
    };
  });

  rows.sort((a, b) => (a.lastMockAt < b.lastMockAt ? 1 : a.lastMockAt > b.lastMockAt ? -1 : 0));
  return rows;
}

async function buildAllActivityRows(range: DateRange) {
  const createdAt = Object.keys(range).length ? range : undefined;
  const summaries = await prisma.attendanceSecuritySummary.findMany({
    where: {
      ...(createdAt ? { createdAt } : {}),
      mockLocationDetected: false,
      securityStatus: { not: "DIRECT_MOCK_SIGNAL" },
      OR: [
        { vpnActive: true },
        { impossibleTravelDetected: true },
        { sensorMismatchDetected: true },
        { playIntegrityStatus: { notIn: ["NOT_CHECKED", "OK", "SKIPPED"] } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });

  const userIds = Array.from(new Set(summaries.map((x) => x.userId)));
  const attendanceIds = Array.from(
    new Set(summaries.map((x) => x.attendanceId).filter((id): id is string => Boolean(id)))
  );
  const [users, attendances] = await Promise.all([
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
      },
    }),
    attendanceIds.length
      ? prisma.attendance.findMany({
          where: { id: { in: attendanceIds } },
          select: { id: true, punchInAt: true, punchOutAt: true },
        })
      : Promise.resolve([]),
  ]);
  const byUser = new Map(users.map((u) => [u.id, u]));
  const byAttendance = new Map(attendances.map((a) => [a.id, a]));

  return summaries.map((row) => {
    const u = byUser.get(row.userId);
    const att = row.attendanceId ? byAttendance.get(row.attendanceId) : undefined;
    return {
      employeeId: row.userId,
      employeeName: u?.name || "",
      mobileNumber: u?.phone || "",
      designation: u?.designation || "",
      team: [u?.zone, u?.district, u?.cluster || u?.assemblyName].filter(Boolean).join(" · "),
      attendanceSessionId: row.attendanceId,
      punchId: row.punchId,
      punchInAt: att?.punchInAt?.toISOString() || null,
      punchOutAt: att?.punchOutAt?.toISOString() || null,
      securityStatus: row.securityStatus,
      riskScore: row.riskScore,
      mockLocationEventCount: 0,
      mockLocationDetected: false,
      firstMockAt: null,
      lastMockAt: null,
      firstSuspiciousAt: row.createdAt.toISOString(),
      lastSuspiciousAt: row.updatedAt.toISOString(),
      supportingOnly: true,
    };
  });
}
