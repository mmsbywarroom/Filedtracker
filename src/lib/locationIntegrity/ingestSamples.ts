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
          attendanceId: opts.attendanceId || null,
          punchId: opts.punchId || null,
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
            attendanceId: opts.attendanceId || null,
            punchId: opts.punchId || null,
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
      ...(opts.attendanceId ? { attendanceId: opts.attendanceId } : {}),
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
          attendanceId: opts.attendanceId || null,
          punchId: opts.punchId || null,
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

  return { accepted: accepted.length, mockCount, impossibleTravelCount: jumps.length };
}

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
  const samples = await prisma.attendanceLocationSample.findMany({
    where: {
      userId: opts.userId,
      OR: [{ punchId: opts.punchId }, ...(opts.attendanceId ? [{ attendanceId: opts.attendanceId }] : [])],
    },
    select: { isMock: true },
    take: 200,
  });
  const directMockSampleCount = samples.filter((s) => s.isMock).length;

  const events = await prisma.attendanceSecurityEvent.findMany({
    where: {
      userId: opts.userId,
      OR: [{ punchId: opts.punchId }, ...(opts.attendanceId ? [{ attendanceId: opts.attendanceId }] : [])],
    },
    select: { eventType: true },
    take: 300,
  });

  const impossibleTravelCount = events.filter((e) => e.eventType === "IMPOSSIBLE_TRAVEL").length;
  const teleportPatternCount = impossibleTravelCount >= 2 ? impossibleTravelCount - 1 : 0;
  const sensorMismatchCount =
    opts.sensorMismatchCount ??
    events.filter((e) => e.eventType === "SENSOR_LOCATION_MISMATCH").length;

  const risk = computeRiskScore({
    directMockSampleCount,
    playIntegrityFailed: Boolean(opts.playIntegrityFailed),
    playIntegrityStrongTamper: Boolean(opts.playIntegrityStrongTamper),
    impossibleTravelCount,
    teleportPatternCount,
    sensorMismatchCount,
    vpnActive: Boolean(opts.vpnActive),
  });

  await prisma.attendanceSecuritySummary.upsert({
    where: { punchId: opts.punchId },
    create: {
      userId: opts.userId,
      attendanceId: opts.attendanceId || null,
      punchId: opts.punchId,
      punchType: opts.punchType,
      attendanceStatus: "SUCCESS",
      appInstallationId: (opts.appInstallationId || "").slice(0, 128),
      mockLocationDetected: risk.mockLocationDetected,
      directMockSampleCount: risk.directMockSampleCount,
      playIntegrityStatus: opts.playIntegrityStatus || "NOT_CHECKED",
      vpnActive: Boolean(opts.vpnActive),
      impossibleTravelDetected: impossibleTravelCount > 0,
      sensorMismatchDetected: sensorMismatchCount > 0,
      riskScore: risk.riskScore,
      securityStatus: risk.securityStatus,
      reasonsJson: JSON.stringify(risk.reasons),
    },
    update: {
      attendanceId: opts.attendanceId || undefined,
      mockLocationDetected: risk.mockLocationDetected,
      directMockSampleCount: risk.directMockSampleCount,
      playIntegrityStatus: opts.playIntegrityStatus || undefined,
      vpnActive: Boolean(opts.vpnActive),
      impossibleTravelDetected: impossibleTravelCount > 0,
      sensorMismatchDetected: sensorMismatchCount > 0,
      riskScore: risk.riskScore,
      securityStatus: risk.securityStatus,
      reasonsJson: JSON.stringify(risk.reasons),
    },
  });

  return risk;
}
