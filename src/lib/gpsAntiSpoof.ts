import { prisma } from "@/lib/prisma";
import { closeOpenAttendance } from "@/lib/punchOut";
import { haversineMeters } from "@/lib/utils";

export type GpsSample = { lat: number; lng: number; accuracy: number | null; at?: number };

export type GpsSpoofFlag =
  | "few_samples"
  | "poor_accuracy"
  | "missing_accuracy"
  | "samples_too_far_apart"
  | "impossible_jump"
  | "duplicate_coordinates"
  | "suspicious_perfect_accuracy"
  | "stationary_session"
  | "random_probe_pinned";

export const GPS_SPOOF_FLAG_LABELS: Record<GpsSpoofFlag, string> = {
  few_samples: "Too few GPS readings",
  poor_accuracy: "GPS accuracy too weak (>80 m)",
  missing_accuracy: "GPS accuracy missing on readings",
  samples_too_far_apart: "Readings spread too far while standing still",
  impossible_jump: "GPS jumped unrealistically between readings",
  duplicate_coordinates: "All readings identical (pinned fake location)",
  suspicious_perfect_accuracy: "Suspiciously perfect GPS (<3 m on all readings)",
  stationary_session: "Punched in but almost no movement all day",
  random_probe_pinned: "Same pinned location on all random GPS checks",
};

const MIN_SAMPLES = Number(process.env.GPS_MIN_SAMPLES || 3);
const MAX_ACCURACY_M = Number(process.env.GPS_MAX_ACCURACY_M || 80);
const MAX_SAMPLE_SPREAD_M = Number(process.env.GPS_MAX_SAMPLE_SPREAD_M || 120);
const MAX_INTER_SAMPLE_M = Number(process.env.GPS_MAX_INTER_SAMPLE_M || 90);
const SUSPICIOUS_PERFECT_M = Number(process.env.GPS_SUSPICIOUS_PERFECT_M || 3);
const STATIONARY_SESSION_M = Number(process.env.GPS_STATIONARY_SESSION_M || 80);
const STATIONARY_MIN_MS = Number(process.env.GPS_STATIONARY_MIN_MS || 2 * 60 * 60 * 1000);

export const GPS_ANTI_SPOOF_ENABLED = process.env.GPS_ANTI_SPOOF_ENABLED !== "false";
/** Observe track points after punch-in before deciding fake GPS (default 30 min). */
export const GPS_OBSERVE_MS = Number(process.env.GPS_OBSERVE_MS || 30 * 60 * 1000);
/** Real field movement — spread above this over observation = genuine user. */
export const GPS_NATURAL_MOVEMENT_M = Number(process.env.GPS_NATURAL_MOVEMENT_M || 20);
/** Below this spread with fake-perfect accuracy = pinned spoof app. */
export const GPS_PINNED_SPREAD_M = Number(process.env.GPS_PINNED_SPREAD_M || 2);
/** Minimum track points before observation can block. */
export const GPS_MIN_OBSERVATION_POINTS = Number(process.env.GPS_MIN_OBSERVATION_POINTS || 8);
/** @deprecated alias */
export const PUNCH_GPS_VERIFY_DELAY_MS = GPS_OBSERVE_MS;
/** How often to re-check live map GPS for natural jitter during observation (default 5 min). */
export const GPS_JITTER_CHECK_INTERVAL_MS = Number(process.env.GPS_JITTER_CHECK_INTERVAL_MS || 5 * 60 * 1000);
/** Min track points before an early jitter check can clear the session. */
export const GPS_JITTER_MIN_POINTS = Number(process.env.GPS_JITTER_MIN_POINTS || 4);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function istDayEnd(from = new Date()) {
  const ymd = from.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

export async function activeGpsBypass(userId: string) {
  return prisma.gpsSpoofBypass.findFirst({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { expiresAt: "desc" },
  });
}

export async function grantGpsBypass(opts: {
  userId: string;
  adminId: string;
  adminName: string;
  reason: string;
  logId?: string | null;
  expiresAt?: Date;
}) {
  const expiresAt = opts.expiresAt ?? istDayEnd();
  await prisma.gpsSpoofBypass.deleteMany({
    where: { userId: opts.userId, expiresAt: { gt: new Date() } },
  });
  return prisma.gpsSpoofBypass.create({
    data: {
      userId: opts.userId,
      expiresAt,
      adminId: opts.adminId,
      adminName: opts.adminName,
      reason: opts.reason,
      logId: opts.logId ?? null,
    },
  });
}

/** Strong spoof signals — block on these alone. */
const HARD_BLOCK_FLAGS = new Set<GpsSpoofFlag>([
  "poor_accuracy",
  "samples_too_far_apart",
  "impossible_jump",
]);

/** Standing still gives identical readings — only block when coords are pinned AND accuracy is fake-perfect. */
function isGpsSpoofBlocked(flags: GpsSpoofFlag[]): boolean {
  if (flags.some((f) => HARD_BLOCK_FLAGS.has(f))) return true;
  return flags.includes("duplicate_coordinates") && flags.includes("suspicious_perfect_accuracy");
}

/** @deprecated use isGpsSpoofBlocked — kept for tests */
const BLOCK_FLAGS = HARD_BLOCK_FLAGS;

export function parseGpsSamples(raw: unknown): GpsSample[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => ({
      lat: Number((s as GpsSample)?.lat),
      lng: Number((s as GpsSample)?.lng),
      accuracy:
        (s as GpsSample)?.accuracy != null && Number.isFinite(Number((s as GpsSample).accuracy))
          ? Number((s as GpsSample).accuracy)
          : null,
      at: (s as GpsSample)?.at != null && Number.isFinite(Number((s as GpsSample).at)) ? Number((s as GpsSample).at) : undefined,
    }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
}

function maxSpreadMeters(samples: GpsSample[]) {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      max = Math.max(max, haversineMeters(samples[i], samples[j]));
    }
  }
  return max;
}

export function analyzeGpsSamples(samples: GpsSample[]) {
  const flags: GpsSpoofFlag[] = [];

  if (samples.length < MIN_SAMPLES) flags.push("few_samples");

  const accuracies = samples.map((s) => s.accuracy).filter((a): a is number => a != null && Number.isFinite(a));
  if (samples.length && accuracies.length < samples.length) flags.push("missing_accuracy");
  if (accuracies.some((a) => a > MAX_ACCURACY_M)) flags.push("poor_accuracy");

  if (samples.length >= MIN_SAMPLES) {
    const spread = maxSpreadMeters(samples);
    if (spread > MAX_SAMPLE_SPREAD_M) flags.push("samples_too_far_apart");

    const sorted = [...samples].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
    for (let i = 1; i < sorted.length; i++) {
      const gap = haversineMeters(sorted[i - 1], sorted[i]);
      if (gap > MAX_INTER_SAMPLE_M) flags.push("impossible_jump");
    }

    const first = sorted[0];
    const allSame = sorted.every((s) => haversineMeters(first, s) < 2);
    if (allSame) flags.push("duplicate_coordinates");

    if (
      accuracies.length === samples.length &&
      accuracies.length >= MIN_SAMPLES &&
      accuracies.every((a) => a <= SUSPICIOUS_PERFECT_M)
    ) {
      flags.push("suspicious_perfect_accuracy");
    }
  }

  const uniqueFlags = Array.from(new Set(flags));
  const blocked = isGpsSpoofBlocked(uniqueFlags);
  const detail = uniqueFlags.length
    ? uniqueFlags.map((f) => GPS_SPOOF_FLAG_LABELS[f]).join("; ")
    : "OK";

  return {
    ok: !blocked,
    flags: uniqueFlags,
    detail,
    maxSpreadM: samples.length >= 2 ? maxSpreadMeters(samples) : 0,
    blocked,
  };
}

/**
 * Real phone GPS wobbles on the map even when standing still (typically 2–20 m).
 * Fake/spoof apps inject one fixed coordinate — spread stays below 2 m.
 */
export function gpsTrackSpreadM(samples: GpsSample[]): number {
  return samples.length >= 2 ? maxSpreadMeters(samples) : 0;
}

export function hasNaturalGpsJitter(samples: GpsSample[], mapSpreadM = 0): boolean {
  return Math.max(gpsTrackSpreadM(samples), mapSpreadM) >= GPS_PINNED_SPREAD_M;
}

/**
 * After punch-in, watch live map track points (default 30 min).
 * Step 1: check map GPS is jittering 2–20 m or moving 20 m+ → real user, never block.
 * Step 2: only if still pinned (<2 m) with fake-perfect accuracy → block.
 */
export function analyzeObservationSession(samples: GpsSample[], mapSpreadM = 0) {
  const spread = Math.max(gpsTrackSpreadM(samples), mapSpreadM);

  if (samples.length < GPS_MIN_OBSERVATION_POINTS) {
    return {
      shouldBlock: false,
      flags: [] as GpsSpoofFlag[],
      detail: "Not enough live map GPS points during observation",
      maxSpreadM: spread,
    };
  }

  // First: live map GPS — idhar-udhar 2–20 m? Real phone → stop fake check (band karo).
  if (hasNaturalGpsJitter(samples, mapSpreadM)) {
    const detail =
      spread >= GPS_NATURAL_MOVEMENT_M
        ? `Map GPS moved ${Math.round(spread)} m during observation — real user`
        : `Map GPS jitter ${Math.round(spread)} m (${GPS_PINNED_SPREAD_M}–${GPS_NATURAL_MOVEMENT_M} m) — real phone GPS`;
    return {
      shouldBlock: false,
      flags: [] as GpsSpoofFlag[],
      detail,
      maxSpreadM: spread,
    };
  }

  const analysis = analyzeGpsSamples(samples);
  if (analysis.flags.includes("impossible_jump") || analysis.flags.includes("samples_too_far_apart")) {
    return {
      shouldBlock: true,
      flags: analysis.flags,
      detail: `${analysis.detail} · Detected on live map track`,
      maxSpreadM: spread,
    };
  }

  // Pinned on map (<2 m spread entire observation) + fake-perfect readings → spoof app
  const accuracies = samples
    .map((s) => s.accuracy)
    .filter((a): a is number => a != null && Number.isFinite(a));
  const withAccuracy = samples.filter((s) => s.accuracy != null).length;
  const allPerfect =
    accuracies.length >= GPS_MIN_OBSERVATION_POINTS &&
    withAccuracy >= GPS_MIN_OBSERVATION_POINTS &&
    accuracies.every((a) => a <= SUSPICIOUS_PERFECT_M);

  if (allPerfect) {
    return {
      shouldBlock: true,
      flags: ["duplicate_coordinates", "suspicious_perfect_accuracy"] as GpsSpoofFlag[],
      detail: `Map GPS pinned (0–${GPS_PINNED_SPREAD_M} m jitter) with fake-perfect accuracy over ${Math.round(GPS_OBSERVE_MS / 60000)} min — spoof app`,
      maxSpreadM: spread,
    };
  }

  return {
    shouldBlock: false,
    flags: ["duplicate_coordinates"] as GpsSpoofFlag[],
    detail: `Map GPS mostly still (${Math.round(spread)} m) but natural accuracy — no block`,
    maxSpreadM: spread,
  };
}

export function userFacingGpsError(flags: GpsSpoofFlag[]) {
  if (flags.includes("poor_accuracy")) {
    return "GPS signal is weak. Go outdoors, turn on high-accuracy location, wait a few seconds, then try again.";
  }
  if (flags.includes("few_samples")) {
    return "Could not verify GPS. Keep location on and try punch again.";
  }
  if (flags.includes("samples_too_far_apart") || flags.includes("impossible_jump")) {
    return "GPS location is unstable. Turn off any fake GPS / location changer app, then try again.";
  }
  if (
    flags.includes("duplicate_coordinates") ||
    flags.includes("suspicious_perfect_accuracy") ||
    flags.includes("random_probe_pinned")
  ) {
    return "Fake GPS detected. Turn off location spoofing apps and punch from your real field location.";
  }
  return "GPS verification failed. Use real location with high-accuracy GPS enabled.";
}

type LogUser = {
  name: string;
  phone: string;
  designation: string;
  assemblyName: string;
  zone: string;
  district: string;
};

export async function recordGpsSpoofLog(opts: {
  userId: string;
  user: LogUser;
  action: string;
  outcome: "blocked" | "flagged" | "bypassed";
  flags: GpsSpoofFlag[];
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  sampleCount?: number;
  maxSpreadM?: number | null;
  detail: string;
  attendanceId?: string | null;
}) {
  try {
    const data = {
      userName: opts.user.name,
      userPhone: opts.user.phone,
      userDesignation: opts.user.designation || "",
      assemblyName: opts.user.assemblyName || "",
      zone: opts.user.zone || "",
      district: opts.user.district || "",
      action: opts.action,
      outcome: opts.outcome,
      flags: opts.flags,
      lat: opts.lat ?? null,
      lng: opts.lng ?? null,
      accuracy: opts.accuracy ?? null,
      sampleCount: opts.sampleCount ?? 0,
      maxSpreadM: opts.maxSpreadM ?? null,
      detail: opts.detail,
      attendanceId: opts.attendanceId ?? null,
    };

    // One log per user for blocked/flagged — update existing instead of creating duplicates.
    if (opts.outcome === "blocked" || opts.outcome === "flagged") {
      const existing = await prisma.gpsSpoofLog.findFirst({
        where: { userId: opts.userId, outcome: { in: ["blocked", "flagged"] } },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        return await prisma.gpsSpoofLog.update({
          where: { id: existing.id },
          data: {
            ...data,
            outcome: opts.outcome === "blocked" || existing.outcome === "blocked" ? "blocked" : "flagged",
            createdAt: new Date(),
          },
        });
      }
    }

    return await prisma.gpsSpoofLog.create({
      data: { userId: opts.userId, ...data },
    });
  } catch (e) {
    console.error("recordGpsSpoofLog", e);
  }
}

export async function enforceGpsAntiSpoof(opts: {
  userId: string;
  user: LogUser;
  action: "punch_in" | "punch_out";
  lat: number;
  lng: number;
  accuracy?: number | null;
  gpsSamples?: unknown;
  attendanceId?: string | null;
}) {
  if (!GPS_ANTI_SPOOF_ENABLED) {
    return { ok: true as const, flags: [] as GpsSpoofFlag[] };
  }

  const bypass = await activeGpsBypass(opts.userId);
  const samples = parseGpsSamples(opts.gpsSamples);
  const analysis = analyzeGpsSamples(samples);

  if (bypass) {
    if (analysis.flags.length) {
      await recordGpsSpoofLog({
        userId: opts.userId,
        user: opts.user,
        action: opts.action,
        outcome: "bypassed",
        flags: analysis.flags,
        lat: opts.lat,
        lng: opts.lng,
        accuracy: opts.accuracy ?? null,
        sampleCount: samples.length,
        maxSpreadM: analysis.maxSpreadM,
        detail: `${analysis.detail} · Admin bypass until ${bypass.expiresAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
        attendanceId: opts.attendanceId,
      });
    }
    return { ok: true as const, flags: analysis.flags, bypassed: true as const };
  }

  if (analysis.flags.length) {
    await recordGpsSpoofLog({
      userId: opts.userId,
      user: opts.user,
      action: opts.action,
      outcome: analysis.blocked ? "blocked" : "flagged",
      flags: analysis.flags,
      lat: opts.lat,
      lng: opts.lng,
      accuracy: opts.accuracy ?? null,
      sampleCount: samples.length,
      maxSpreadM: analysis.maxSpreadM,
      detail: analysis.detail,
      attendanceId: opts.attendanceId,
    });
  }

  if (!analysis.ok) {
    return {
      ok: false as const,
      flags: analysis.flags,
      error: userFacingGpsError(analysis.flags),
      code: "GPS_SPOOF" as const,
    };
  }

  return { ok: true as const, flags: analysis.flags };
}

/** Instant punch — do not block; GPS is verified in background from track points. */
export async function enforceGpsAntiSpoofInstant(opts: {
  userId: string;
  user: LogUser;
  action: "punch_in" | "punch_out";
  lat: number;
  lng: number;
  accuracy?: number | null;
  gpsSamples?: unknown;
}) {
  if (!GPS_ANTI_SPOOF_ENABLED) {
    return { ok: true as const, flags: [] as GpsSpoofFlag[], deferred: true as const };
  }

  const bypass = await activeGpsBypass(opts.userId);
  if (bypass) {
    return { ok: true as const, flags: [] as GpsSpoofFlag[], bypassed: true as const };
  }

  return { ok: true as const, flags: [] as GpsSpoofFlag[], deferred: true as const };
}

function trackPointsToSamples(
  punchIn: { lat: number; lng: number; at: Date },
  points: { lat: number; lng: number; accuracy: number | null; recordedAt: Date }[],
  punchOut?: { lat: number; lng: number; accuracy: number | null; at: number }
): GpsSample[] {
  const samples: GpsSample[] = [
    { lat: punchIn.lat, lng: punchIn.lng, accuracy: null, at: punchIn.at.getTime() },
    ...points.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      accuracy: p.accuracy,
      at: p.recordedAt.getTime(),
    })),
  ];
  if (punchOut) {
    samples.push({
      lat: punchOut.lat,
      lng: punchOut.lng,
      accuracy: punchOut.accuracy,
      at: punchOut.at,
    });
  }
  return samples;
}

export function schedulePunchInGpsVerification(opts: {
  userId: string;
  user: LogUser;
  attendanceId: string;
}) {
  void verifyPunchInGpsLater(opts).catch((e) => console.error("verifyPunchInGpsLater", e));
}

async function verifyPunchInGpsLater(opts: {
  userId: string;
  user: LogUser;
  attendanceId: string;
}) {
  const started = Date.now();

  while (Date.now() - started < GPS_OBSERVE_MS) {
    const waitMs = Math.min(GPS_JITTER_CHECK_INTERVAL_MS, GPS_OBSERVE_MS - (Date.now() - started));
    if (waitMs <= 0) break;
    await sleep(waitMs);

    if (await activeGpsBypass(opts.userId)) return;

    const live = await prisma.attendance.findFirst({
      where: { id: opts.attendanceId, userId: opts.userId, punchOutAt: null },
      select: {
        punchInLat: true,
        punchInLng: true,
        punchInAt: true,
        gpsMapSpreadM: true,
        points: { orderBy: { recordedAt: "asc" }, take: 200 },
      },
    });
    if (!live) return;

    if ((live.gpsMapSpreadM ?? 0) >= GPS_PINNED_SPREAD_M) return;

    const liveSamples = trackPointsToSamples(
      { lat: live.punchInLat, lng: live.punchInLng, at: live.punchInAt },
      live.points
    );

    if (
      liveSamples.length >= GPS_JITTER_MIN_POINTS &&
      hasNaturalGpsJitter(liveSamples, live.gpsMapSpreadM ?? 0)
    ) {
      return;
    }
  }

  if (await activeGpsBypass(opts.userId)) return;

  const attendance = await prisma.attendance.findFirst({
    where: { id: opts.attendanceId, userId: opts.userId, punchOutAt: null },
    include: { points: { orderBy: { recordedAt: "asc" }, take: 200 } },
  });
  if (!attendance) return;

  if ((attendance.gpsMapSpreadM ?? 0) >= GPS_PINNED_SPREAD_M) return;

  const samples = trackPointsToSamples(
    { lat: attendance.punchInLat, lng: attendance.punchInLng, at: attendance.punchInAt },
    attendance.points
  );

  const observation = analyzeObservationSession(samples, attendance.gpsMapSpreadM ?? 0);
  if (!observation.shouldBlock) return;

  const last = attendance.points[attendance.points.length - 1];
  const lat = last?.lat ?? attendance.punchInLat;
  const lng = last?.lng ?? attendance.punchInLng;

  await recordGpsSpoofLog({
    userId: opts.userId,
    user: opts.user,
    action: "punch_in",
    outcome: "blocked",
    flags: observation.flags,
    lat,
    lng,
    sampleCount: samples.length,
    maxSpreadM: observation.maxSpreadM,
    detail: observation.detail,
    attendanceId: attendance.id,
  });
  await closeOpenAttendance({
    userId: opts.userId,
    lat,
    lng,
    accuracy: last?.accuracy ?? null,
    reason: "gps_spoof",
    address: "Auto punch-out: fake GPS detected after observation",
  });
}

export function schedulePunchOutGpsVerification(opts: {
  userId: string;
  user: LogUser;
  attendanceId: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
}) {
  void verifyPunchOutGpsLater(opts).catch((e) => console.error("verifyPunchOutGpsLater", e));
}

async function verifyPunchOutGpsLater(opts: {
  userId: string;
  user: LogUser;
  attendanceId: string;
  lat: number;
  lng: number;
  accuracy?: number | null;
}) {
  if (await activeGpsBypass(opts.userId)) return;

  const attendance = await prisma.attendance.findUnique({
    where: { id: opts.attendanceId },
    include: { points: { orderBy: { recordedAt: "asc" }, take: 80 } },
  });
  if (!attendance) return;

  if ((attendance.gpsMapSpreadM ?? 0) >= GPS_NATURAL_MOVEMENT_M) return;
  if (attendance.distanceMeters >= GPS_NATURAL_MOVEMENT_M) return;

  const samples = trackPointsToSamples(
    { lat: attendance.punchInLat, lng: attendance.punchInLng, at: attendance.punchInAt },
    attendance.points,
    {
      lat: opts.lat,
      lng: opts.lng,
      accuracy: opts.accuracy ?? null,
      at: attendance.punchOutAt?.getTime() ?? Date.now(),
    }
  );
  const observation = analyzeObservationSession(samples, attendance.gpsMapSpreadM ?? 0);
  if (!observation.shouldBlock) return;

  await recordGpsSpoofLog({
    userId: opts.userId,
    user: opts.user,
    action: "punch_out",
    outcome: "blocked",
    flags: observation.flags,
    lat: opts.lat,
    lng: opts.lng,
    accuracy: opts.accuracy ?? null,
    sampleCount: samples.length,
    maxSpreadM: observation.maxSpreadM,
    detail: `${observation.detail} · Session review after punch-out`,
    attendanceId: attendance.id,
  });
}

export async function flagStationarySession(opts: {
  userId: string;
  user: LogUser;
  attendanceId: string;
  punchInAt: Date;
  punchOutAt: Date;
  distanceMeters: number;
  lat?: number | null;
  lng?: number | null;
}) {
  if (!GPS_ANTI_SPOOF_ENABLED) return;
  const durationMs = opts.punchOutAt.getTime() - opts.punchInAt.getTime();
  if (durationMs < STATIONARY_MIN_MS) return;
  if (opts.distanceMeters >= STATIONARY_SESSION_M) return;

  const flags: GpsSpoofFlag[] = ["stationary_session"];
  const existing = await prisma.gpsSpoofLog.findFirst({
    where: { attendanceId: opts.attendanceId, outcome: { in: ["blocked", "flagged"] } },
  });
  if (existing) return;

  await recordGpsSpoofLog({
    userId: opts.userId,
    user: opts.user,
    action: "punch_out",
    outcome: "flagged",
    flags,
    lat: opts.lat ?? null,
    lng: opts.lng ?? null,
    sampleCount: 0,
    detail: `Session ${(durationMs / 3600000).toFixed(1)} hr but only ${Math.round(opts.distanceMeters)} m travel — possible fake punch from home.`,
    attendanceId: opts.attendanceId,
  });
}
