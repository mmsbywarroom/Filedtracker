import { prisma } from "@/lib/prisma";
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

const BLOCK_FLAGS = new Set<GpsSpoofFlag>([
  "few_samples",
  "poor_accuracy",
  "samples_too_far_apart",
  "impossible_jump",
  "duplicate_coordinates",
  "suspicious_perfect_accuracy",
]);

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
  const blocked = uniqueFlags.some((f) => BLOCK_FLAGS.has(f));
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
  outcome: "blocked" | "flagged";
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

  const samples = parseGpsSamples(opts.gpsSamples);
  const analysis = analyzeGpsSamples(samples);

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
