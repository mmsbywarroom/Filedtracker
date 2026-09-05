import { prisma } from "@/lib/prisma";
import { findImpossibleTravel } from "./impossibleTravel";
import { computeRiskScore } from "./riskScore";

type SampleIn = {
  sampleId: string;
  source?: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
  altitude?: number | null;
  speed?: number | null;
  bearing?: number | null;
  provider?: string;
  isMock?: boolean;
  locationTimestamp?: string | number;
  elapsedRealtimeNanos?: string;
  vpnActive?: boolean;
};

function parseTs(v: unknown): Date {
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v > 1e12 ? v : v * 1000);
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** Prefer client attendanceId; else attach to currently open punch session. */
export async function resolveAttendanceSessionId(
  userId: string,
  attendanceId?: string | null
): Promise<string | null> {
  if (attendanceId && attendanceId.trim()) return attendanceId.trim();
  const open = await prisma.attendance.findFirst({
    where: { userId, punchOutAt: null },
    orderBy: { punchInAt: "desc" },
    select: { id: true },
  });
  return open?.id || null;
}

export async function upsertDeviceInstall(opts: {
  userId: string;
  appInstallationId: string;
  appVersion?: string;
  versionCode?: number;
  androidVersion?: string;
  manufacturer?: string;
  model?: string;
}) {
  if (!opts.appInstallationId) return;
  await prisma.deviceAppInstallation.upsert({
    where: {
      userId_appInstallationId: {
        userId: opts.userId,
        appInstallationId: opts.appInstallationId.slice(0, 128),
      },
    },
    create: {
      userId: opts.userId,
      appInstallationId: opts.appInstallationId.slice(0, 128),
      appVersion: (opts.appVersion || "").slice(0, 40),
      versionCode: opts.versionCode || 0,
      androidVersion: (opts.androidVersion || "").slice(0, 40),
      manufacturer: (opts.manufacturer || "").slice(0, 80),
      model: (opts.model || "").slice(0, 80),
    },
    update: {
      lastSeenAt: new Date(),
      appVersion: (opts.appVersion || "").slice(0, 40),
      versionCode: opts.versionCode || 0,
      androidVersion: (opts.androidVersion || "").slice(0, 40),
      manufacturer: (opts.manufacturer || "").slice(0, 80),
      model: (opts.model || "").slice(0, 80),
    },
  });
}

/**
 * Recount mock evidence for a punch/attendance session and persist summary.
 * Whenever isMock evidence exists → mockLocationDetected, DIRECT_MOCK_SIGNAL, recalculated risk.
 */
export async function refreshSecuritySummaryFromEvidence(opts: {
  userId: string;
  attendanceId?: string | null;
  punchId?: string | null;
  punchType?: string;
  appInstallationId?: string;
  vpnActive?: boolean;
  playIntegrityStatus?: string;
  playIntegrityFailed?: boolean;
  playIntegrityStrongTamper?: boolean;
  sensorMismatchCount?: number;
}) {
  const attendanceId = opts.attendanceId || null;
  let punchId = (opts.punchId || "").trim();

  if (!punchId && attendanceId) {
    const existing = await prisma.attendanceSecuritySummary.findFirst({
      where: { userId: opts.userId, attendanceId },
      orderBy: { createdAt: "desc" },
      select: { punchId: true },
    });
    punchId = existing?.punchId || `att_${attendanceId}`;
  }
  if (!punchId) return null;

  const sessionOr: Array<{ punchId: string } | { attendanceId: string }> = [{ punchId }];
  if (attendanceId) sessionOr.push({ attendanceId });

  const [mockSamples, mockEvents, events] = await Promise.all([
    prisma.attendanceLocationSample.findMany({
      where: { userId: opts.userId, isMock: true, OR: sessionOr },
      select: { sampleId: true, locationTimestamp: true },
      take: 500,
    }),
    prisma.attendanceSecurityEvent.findMany({
      where: {
        userId: opts.userId,
        eventType: "MOCK_LOCATION_OS_SIGNAL",
        OR: sessionOr,
      },
      select: { eventId: true, eventTimestamp: true },
      take: 500,
    }),
    prisma.attendanceSecurityEvent.findMany({
      where: { userId: opts.userId, OR: sessionOr },
      select: { eventType: true, vpnActive: true },
      take: 300,
    }),
  ]);

  // Unique mock evidence count (samples + OS-signal events, prefer sample count + events without double-count by id prefix)
  const mockSampleIds = new Set(mockSamples.map((s) => s.sampleId));
  const extraMockEvents = mockEvents.filter((e) => {
    const sid = e.eventId.startsWith("ev_mock_") ? e.eventId.slice("ev_mock_".length) : "";
    return !sid || !mockSampleIds.has(sid);
  });
  const directMockSampleCount = mockSampleIds.size + extraMockEvents.length;

  const impossibleTravelCount = events.filter((e) => e.eventType === "IMPOSSIBLE_TRAVEL").length;
  const teleportPatternCount = impossibleTravelCount >= 2 ? impossibleTravelCount - 1 : 0;
  const sensorMismatchCount =
    opts.sensorMismatchCount ??
    events.filter((e) => e.eventType === "SENSOR_LOCATION_MISMATCH").length;
  const vpnActive = Boolean(opts.vpnActive) || events.some((e) => e.vpnActive);

  const risk = computeRiskScore({
    directMockSampleCount,
    playIntegrityFailed: Boolean(opts.playIntegrityFailed),
    playIntegrityStrongTamper: Boolean(opts.playIntegrityStrongTamper),
    impossibleTravelCount,
    teleportPatternCount,
    sensorMismatchCount,
    vpnActive,
  });

  // Hard guarantee: any direct OS mock → DIRECT_MOCK_SIGNAL + mockLocationDetected
  const securityStatus =
    directMockSampleCount > 0 ? ("DIRECT_MOCK_SIGNAL" as const) : risk.securityStatus;
  const mockLocationDetected = directMockSampleCount > 0;

  await prisma.attendanceSecuritySummary.upsert({
    where: { punchId },
    create: {
      userId: opts.userId,
      attendanceId,
      punchId,
      punchType: opts.punchType || "session",
      attendanceStatus: "SUCCESS",
      appInstallationId: (opts.appInstallationId || "").slice(0, 128),
      mockLocationDetected,
      directMockSampleCount,
      playIntegrityStatus: opts.playIntegrityStatus || "NOT_CHECKED",
      vpnActive,
      impossibleTravelDetected: impossibleTravelCount > 0,
      sensorMismatchDetected: sensorMismatchCount > 0,
      riskScore: risk.riskScore,
      securityStatus,
      reasonsJson: JSON.stringify(risk.reasons),
    },
    update: {
      attendanceId: attendanceId || undefined,
      mockLocationDetected,
      directMockSampleCount,
      playIntegrityStatus: opts.playIntegrityStatus || undefined,
      vpnActive,
      impossibleTravelDetected: impossibleTravelCount > 0,
      sensorMismatchDetected: sensorMismatchCount > 0,
      riskScore: risk.riskScore,
      securityStatus,
      reasonsJson: JSON.stringify(risk.reasons),
      ...(opts.appInstallationId
        ? { appInstallationId: opts.appInstallationId.slice(0, 128) }
        : {}),
    },
  });

  return {
    ...risk,
    mockLocationDetected,
    directMockSampleCount,
    securityStatus,
    punchId,
    attendanceId,
  };
}

export async function ingestLocationSamples(opts: {
  userId: string;
  attendanceId?: string | null;
  punchId?: string | null;
  appInstallationId?: string;
  samples: SampleIn[];
  device?: {
    appVersion?: string;
    versionCode?: number;
    androidVersion?: string;
    manufacturer?: string;
    model?: string;
  };
}) {
  const installId = (opts.appInstallationId || "").slice(0, 128);
  if (installId) {
    await upsertDeviceInstall({
      userId: opts.userId,
      appInstallationId: installId,
      ...opts.device,
    });
  }

  const attendanceId = await resolveAttendanceSessionId(opts.userId, opts.attendanceId);
  const punchId = opts.punchId?.trim() || null;

  let mockCount = 0;
  const accepted: string[] = [];

  for (const s of opts.samples.slice(0, 40)) {
    const sampleId = String(s.sampleId || "").slice(0, 80);
    if (!sampleId) continue;
    const lat = Number(s.lat);
    const lng = Number(s.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const isMock = Boolean(s.isMock);
    if (isMock) mockCount += 1;
    const locationTimestamp = parseTs(s.locationTimestamp);

    try {
      await prisma.attendanceLocationSample.create({
        data: {
          sampleId,
          userId: opts.userId,
          attendanceId,
          punchId,
          appInstallationId: installId,
          source: String(s.source || "background").slice(0, 40),
          lat,
          lng,
          accuracy: Number.isFinite(Number(s.accuracy)) ? Number(s.accuracy) : null,
          altitude: Number.isFinite(Number(s.altitude)) ? Number(s.altitude) : null,
          speed: Number.isFinite(Number(s.speed)) ? Number(s.speed) : null,
          bearing: Number.isFinite(Number(s.bearing)) ? Number(s.bearing) : null,
          provider: String(s.provider || "").slice(0, 40),
          isMock,
          locationTimestamp,
          elapsedRealtimeNanos: String(s.elapsedRealtimeNanos || "").slice(0, 40),
          vpnActive: Boolean(s.vpnActive),
        },
      });
      accepted.push(sampleId);
    } catch {
      // unique sampleId → dedupe on retry
    }

    if (isMock) {
      const eventId = `ev_mock_${sampleId}`;
      try {
        await prisma.attendanceSecurityEvent.create({
          data: {
            eventId,
            userId: opts.userId,
            attendanceId,
            punchId,
            appInstallationId: installId,
            eventType: "MOCK_LOCATION_OS_SIGNAL",
            eventTimestamp: locationTimestamp,
            lat,
            lng,
            accuracy: Number.isFinite(Number(s.accuracy)) ? Number(s.accuracy) : null,
            isMock: true,
            provider: String(s.provider || "").slice(0, 40),
            vpnActive: Boolean(s.vpnActive),
            riskWeight: 100,
            confidence: "DIRECT_OS_SIGNAL",
            metadataJson: JSON.stringify({
              reason: "Android OS marked this location as mock.",
              sampleId,
            }),
          },
        });
      } catch {
        // dedupe
      }
    }
  }

  // Impossible travel among recent samples for this user/session
  const recent = await prisma.attendanceLocationSample.findMany({
    where: {
      userId: opts.userId,
      ...(attendanceId ? { attendanceId } : {}),
      locationTimestamp: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
    },
    orderBy: { locationTimestamp: "asc" },
    take: 80,
    select: { sampleId: true, lat: true, lng: true, locationTimestamp: true, isMock: true },
  });

  const jumps = findImpossibleTravel(
    recent.map((r) => ({
      lat: r.lat,
      lng: r.lng,
      atMs: r.locationTimestamp.getTime(),
      isMock: r.isMock,
      sampleId: r.sampleId,
    }))
  );

  for (const j of jumps.slice(0, 5)) {
    const eventId = `ev_travel_${j.from.sampleId}_${j.to.sampleId}`;
    try {
      await prisma.attendanceSecurityEvent.create({
        data: {
          eventId,
          userId: opts.userId,
          attendanceId,
          punchId,
          appInstallationId: installId,
          eventType: "IMPOSSIBLE_TRAVEL",
          eventTimestamp: new Date(j.to.atMs),
          lat: j.to.lat,
          lng: j.to.lng,
          isMock: false,
          riskWeight: 30,
          confidence: "SUPPORTING",
          metadataJson: JSON.stringify({
            from: j.from,
            to: j.to,
            distanceM: Math.round(j.distanceM),
            timeSec: Math.round(j.timeSec),
            speedKmh: Math.round(j.speedKmh),
          }),
        },
      });
    } catch {
      // dedupe
    }
  }

  // Always refresh summary when mock evidence arrives (mid-session or punch).
  if (mockCount > 0 || punchId) {
    try {
      await refreshSecuritySummaryFromEvidence({
        userId: opts.userId,
        attendanceId,
        punchId,
        appInstallationId: installId,
        vpnActive: opts.samples.some((s) => Boolean(s.vpnActive)),
      });
    } catch {
      // never affect attendance
    }
  }

  return { accepted: accepted.length, mockCount, impossibleTravelCount: jumps.length, attendanceId };
}

/** @deprecated name kept — delegates to refreshSecuritySummaryFromEvidence */
export async function upsertPunchSecuritySummary(opts: {
  userId: string;
  attendanceId?: string | null;
  punchId: string;
  punchType: string;
  appInstallationId?: string;
  vpnActive?: boolean;
  playIntegrityStatus?: string;
  playIntegrityFailed?: boolean;
  playIntegrityStrongTamper?: boolean;
  sensorMismatchCount?: number;
}) {
  return refreshSecuritySummaryFromEvidence(opts);
}
