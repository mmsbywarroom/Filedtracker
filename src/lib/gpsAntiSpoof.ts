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
  | "stationary_session";

export const GPS_SPOOF_FLAG_LABELS: Record<GpsSpoofFlag, string> = {
  few_samples: "Too few GPS readings",
  poor_accuracy: "GPS accuracy too weak (>80 m)",
  missing_accuracy: "GPS accuracy missing on readings",
  samples_too_far_apart: "Readings spread too far while standing still",
  impossible_jump: "GPS jumped unrealistically between readings",
  duplicate_coordinates: "All readings identical (pinned fake location)",
  suspicious_perfect_accuracy: "Suspiciously perfect GPS (<3 m on all readings)",
  stationary_session: "Punched in but almost no movement all day",
};

const MIN_SAMPLES = Number(process.env.GPS_MIN_SAMPLES || 3);
const MAX_ACCURACY_M = Number(process.env.GPS_MAX_ACCURACY_M || 80);
const MAX_SAMPLE_SPREAD_M = Number(process.env.GPS_MAX_SAMPLE_SPREAD_M || 120);
const MAX_INTER_SAMPLE_M = Number(process.env.GPS_MAX_INTER_SAMPLE_M || 90);
const SUSPICIOUS_PERFECT_M = Number(process.env.GPS_SUSPICIOUS_PERFECT_M || 3);
const STATIONARY_SESSION_M = Number(process.env.GPS_STATIONARY_SESSION_M || 80);
const STATIONARY_MIN_MS = Number(process.env.GPS_STATIONARY_MIN_MS || 2 * 60 * 60 * 1000);

export const GPS_ANTI_SPOOF_ENABLED = process.env.GPS_ANTI_SPOOF_ENABLED !== "false";
/** Wait for track points before background punch-in GPS check (default 90s). */
export const PUNCH_GPS_VERIFY_DELAY_MS = Number(process.env.PUNCH_GPS_VERIFY_DELAY_MS || 90000);

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
    flags.includes("suspicious_perfect_accuracy")
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
    await prisma.gpsSpoofLog.create({
      data: {
        userId: opts.userId,
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
      },
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
    const samples = parseGpsSamples(opts.gpsSamples);
    if (samples.length === 0) {
      samples.push({
        lat: opts.lat,
        lng: opts.lng,
        accuracy: opts.accuracy ?? null,
        at: Date.now(),
      });
    }
    const analysis = analyzeGpsSamples(samples);
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
        detail: `${analysis.detail} · Admin bypass active`,
      });
    }
    return { ok: true as const, flags: analysis.flags, bypassed: true as const };
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
  await sleep(PUNCH_GPS_VERIFY_DELAY_MS);
  if (await activeGpsBypass(opts.userId)) return;

  const attendance = await prisma.attendance.findFirst({
    where: { id: opts.attendanceId, userId: opts.userId, punchOutAt: null },
    include: { points: { orderBy: { recordedAt: "asc" }, take: 40 } },
  });
  if (!attendance) return;

  const samples = trackPointsToSamples(
    { lat: attendance.punchInLat, lng: attendance.punchInLng, at: attendance.punchInAt },
    attendance.points
  );
  if (samples.length < MIN_SAMPLES) return;

  const analysis = analyzeGpsSamples(samples);
  if (!analysis.flags.length) return;

  const last = attendance.points[attendance.points.length - 1];
  const lat = last?.lat ?? attendance.punchInLat;
  const lng = last?.lng ?? attendance.punchInLng;

  if (analysis.blocked) {
    await recordGpsSpoofLog({
      userId: opts.userId,
      user: opts.user,
      action: "punch_in",
      outcome: "blocked",
      flags: analysis.flags,
      lat,
      lng,
      sampleCount: samples.length,
      maxSpreadM: analysis.maxSpreadM,
      detail: `${analysis.detail} · Auto punch-out after background GPS check`,
      attendanceId: attendance.id,
    });
    await closeOpenAttendance({
      userId: opts.userId,
      lat,
      lng,
      accuracy: last?.accuracy ?? null,
      reason: "gps_spoof",
      address: "Auto punch-out: fake or invalid GPS detected",
    });
    return;
  }

  await recordGpsSpoofLog({
    userId: opts.userId,
    user: opts.user,
    action: "punch_in",
    outcome: "flagged",
    flags: analysis.flags,
    lat,
    lng,
    sampleCount: samples.length,
    maxSpreadM: analysis.maxSpreadM,
    detail: `${analysis.detail} · Background GPS check`,
    attendanceId: attendance.id,
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
  const analysis = analyzeGpsSamples(samples);
  if (!analysis.flags.length) return;

  await recordGpsSpoofLog({
    userId: opts.userId,
    user: opts.user,
    action: "punch_out",
    outcome: analysis.blocked ? "blocked" : "flagged",
    flags: analysis.flags,
    lat: opts.lat,
    lng: opts.lng,
    accuracy: opts.accuracy ?? null,
    sampleCount: samples.length,
    maxSpreadM: analysis.maxSpreadM,
    detail: `${analysis.detail} · Background GPS check after punch-out`,
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
