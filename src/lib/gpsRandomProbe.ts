import { prisma } from "@/lib/prisma";
import { closeOpenAttendance } from "@/lib/punchOut";
import { haversineMeters } from "@/lib/utils";
import {
  activeGpsBypass,
  recordGpsSpoofLog,
  type GpsSpoofFlag,
} from "@/lib/gpsAntiSpoof";
import {
  buildSpoofEvidence,
  convictSpoofIfProven,
  GPS_PINNED_SPREAD_M,
  isRealPhoneSignature,
  type GpsSample as VerdictSample,
} from "@/lib/gpsSpoofVerdict";

/** How many surprise GPS checks per session (5–6). */
export const GPS_RANDOM_PROBE_COUNT = Math.min(
  6,
  Math.max(5, Number(process.env.GPS_RANDOM_PROBE_COUNT || 6))
);
/** Spread probes across first N ms after punch-in (default 90 min). */
export const GPS_RANDOM_PROBE_WINDOW_MS = Number(process.env.GPS_RANDOM_PROBE_WINDOW_MS || 90 * 60 * 1000);
/** Minimum gap between two random probe times. */
export const GPS_RANDOM_PROBE_MIN_GAP_MS = Number(process.env.GPS_RANDOM_PROBE_MIN_GAP_MS || 4 * 60 * 1000);
/** Grace after scheduled time before probe is rejected (default 8 min). */
export const GPS_RANDOM_PROBE_LATE_MS = Number(process.env.GPS_RANDOM_PROBE_LATE_MS || 8 * 60 * 1000);
const SUSPICIOUS_PERFECT_M = Number(process.env.GPS_SUSPICIOUS_PERFECT_M || 3);

export type RandomProbeRow = { slot: number; lat: number; lng: number; accuracy: number | null; recordedAt: Date };

type LogUser = {
  name: string;
  phone: string;
  designation: string;
  assemblyName: string;
  zone: string;
  district: string;
};

function hashSeed(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Build 5–6 random probe offsets (ms from punch-in) with minimum spacing. */
export function buildRandomProbeSchedule(attendanceId: string, punchInAt: Date): number[] {
  const rand = seededRandom(hashSeed(`${attendanceId}:${punchInAt.getTime()}`));
  const count = GPS_RANDOM_PROBE_COUNT;
  const minStart = 3 * 60 * 1000;
  const maxEnd = GPS_RANDOM_PROBE_WINDOW_MS;
  const slots: number[] = [];

  for (let attempt = 0; attempt < 200 && slots.length < count; attempt++) {
    const t = minStart + rand() * (maxEnd - minStart);
    if (slots.every((s) => Math.abs(s - t) >= GPS_RANDOM_PROBE_MIN_GAP_MS)) {
      slots.push(Math.round(t));
    }
  }

  while (slots.length < count) {
    const t = minStart + ((slots.length + 1) / (count + 1)) * (maxEnd - minStart);
    slots.push(Math.round(t));
  }

  return slots.sort((a, b) => a - b);
}

export function parseProbeSchedule(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
}

function probesToSamples(probes: RandomProbeRow[]): VerdictSample[] {
  return probes.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy,
    at: p.recordedAt.getTime(),
  }));
}

/** Check 1 — enough random probes received. */
export function checkRandomProbeCount(probes: RandomProbeRow[], required = GPS_RANDOM_PROBE_COUNT) {
  return probes.length >= required;
}

/** Check 2 — probes span enough time (not burst fake). */
export function checkRandomProbeTimeSpread(probes: RandomProbeRow[], minSpanMs = GPS_RANDOM_PROBE_MIN_GAP_MS) {
  if (probes.length < 2) return false;
  const times = probes.map((p) => p.recordedAt.getTime()).sort((a, b) => a - b);
  return times[times.length - 1] - times[0] >= minSpanMs * (probes.length - 1);
}

/** Check 3 — all probe coordinates within pinned spread. */
export function checkRandomProbeSpread(probes: RandomProbeRow[], maxM = GPS_PINNED_SPREAD_M) {
  const samples = probesToSamples(probes);
  return samples.length >= 2 && maxProbeSpread(samples) < maxM;
}

/** Check 4 — every reading identical (duplicate coords). */
export function checkRandomProbeIdentical(probes: RandomProbeRow[]) {
  if (probes.length < 2) return false;
  const first = probes[0];
  return probes.every((p) => haversineMeters(first, p) < 2);
}

/** Check 5 — suspiciously perfect accuracy on all probes. */
export function checkRandomProbePerfectAccuracy(probes: RandomProbeRow[]) {
  const accs = probes.map((p) => p.accuracy).filter((a): a is number => a != null && Number.isFinite(a));
  return accs.length >= probes.length && accs.every((a) => a <= SUSPICIOUS_PERFECT_M);
}

/** Check 6 — no natural phone GPS jitter across random checks. */
export function checkRandomProbeNoJitter(probes: RandomProbeRow[]) {
  return maxProbeSpread(probesToSamples(probes)) >= GPS_PINNED_SPREAD_M;
}

export type RandomProbeAnalysis = {
  shouldBlock: boolean;
  flags: GpsSpoofFlag[];
  detail: string;
  maxSpreadM: number;
  checks: Record<string, boolean>;
};

/**
 * Run random-probe analysis via multi-signal verdict (same rules as 30 min observation).
 */
export function analyzeRandomProbes(probes: RandomProbeRow[]): RandomProbeAnalysis {
  const randomSamples: VerdictSample[] = probes.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy,
    at: p.recordedAt.getTime(),
  }));
  const spread = randomSamples.length >= 2 ? maxProbeSpread(randomSamples) : 0;
  const evidence = buildSpoofEvidence({ samples: [], randomProbes: randomSamples });
  const verdict = convictSpoofIfProven(evidence);

  const checks = {
    count: probes.length >= GPS_RANDOM_PROBE_COUNT,
    timeSpread: checkRandomProbeTimeSpread(probes),
    pinnedSpread: spread < GPS_PINNED_SPREAD_M,
    identical: checkRandomProbeIdentical(probes),
    perfectAccuracy: checkRandomProbePerfectAccuracy(probes),
    noJitter: spread < GPS_PINNED_SPREAD_M,
  };

  return {
    shouldBlock: verdict.shouldBlock && checks.count,
    flags: verdict.flags,
    detail: verdict.detail,
    maxSpreadM: spread,
    checks,
  };
}

function maxProbeSpread(samples: { lat: number; lng: number }[]) {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      max = Math.max(max, haversineMeters(samples[i], samples[j]));
    }
  }
  return max;
}

export async function ensureProbeSchedule(attendanceId: string, punchInAt: Date) {
  const row = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    select: { gpsProbeSchedule: true },
  });
  const existing = parseProbeSchedule(row?.gpsProbeSchedule);
  if (existing.length >= GPS_RANDOM_PROBE_COUNT) return existing;

  const schedule = buildRandomProbeSchedule(attendanceId, punchInAt);
  await prisma.attendance.update({
    where: { id: attendanceId },
    data: { gpsProbeSchedule: schedule },
  });
  return schedule;
}

export async function submitRandomGpsProbe(opts: {
  userId: string;
  user: LogUser;
  attendanceId: string;
  slot: number;
  lat: number;
  lng: number;
  accuracy?: number | null;
}) {
  if (opts.slot < 1 || opts.slot > GPS_RANDOM_PROBE_COUNT) {
    return { ok: false as const, error: "Invalid probe slot.", code: "INVALID_PROBE" as const };
  }

  if (await activeGpsBypass(opts.userId)) {
    return { ok: true as const, bypassed: true as const };
  }

  const open = await prisma.attendance.findFirst({
    where: { id: opts.attendanceId, userId: opts.userId, punchOutAt: null },
    select: {
      id: true,
      punchInAt: true,
      punchInLat: true,
      punchInLng: true,
      gpsMapSpreadM: true,
      gpsProbeSchedule: true,
    },
  });
  if (!open) return { ok: false as const, error: "No active session.", code: "NO_SESSION" as const };

  if ((open.gpsMapSpreadM ?? 0) >= GPS_PINNED_SPREAD_M) {
    return { ok: true as const, cleared: true as const, reason: "map_jitter" as const };
  }

  const probeSample: VerdictSample[] = [
    { lat: opts.lat, lng: opts.lng, accuracy: opts.accuracy ?? null, at: Date.now() },
  ];
  if (isRealPhoneSignature(probeSample, open.gpsMapSpreadM ?? 0).real) {
    return { ok: true as const, cleared: true as const, reason: "natural_accuracy" as const };
  }

  const schedule = parseProbeSchedule(open.gpsProbeSchedule);
  if (schedule.length < GPS_RANDOM_PROBE_COUNT) {
    return { ok: false as const, error: "Probe schedule not ready.", code: "NO_SCHEDULE" as const };
  }

  const scheduledMs = schedule[opts.slot - 1];
  const elapsed = Date.now() - open.punchInAt.getTime();
  const earlyMs = 45_000;
  if (elapsed < scheduledMs - earlyMs) {
    return { ok: false as const, error: "Random GPS check not due yet.", code: "TOO_EARLY" as const };
  }
  if (elapsed > scheduledMs + GPS_RANDOM_PROBE_LATE_MS) {
    return { ok: false as const, error: "Random GPS check window expired.", code: "TOO_LATE" as const };
  }

  await prisma.gpsRandomProbe.upsert({
    where: { attendanceId_slot: { attendanceId: open.id, slot: opts.slot } },
    create: {
      attendanceId: open.id,
      slot: opts.slot,
      lat: opts.lat,
      lng: opts.lng,
      accuracy: opts.accuracy ?? null,
    },
    update: {
      lat: opts.lat,
      lng: opts.lng,
      accuracy: opts.accuracy ?? null,
      recordedAt: new Date(),
    },
  });

  const probes = await prisma.gpsRandomProbe.findMany({
    where: { attendanceId: open.id },
    orderBy: { slot: "asc" },
  });

  const analysis = analyzeRandomProbes(probes);
  if (!analysis.shouldBlock) {
    return {
      ok: true as const,
      received: probes.length,
      required: GPS_RANDOM_PROBE_COUNT,
      cleared: probes.length >= GPS_RANDOM_PROBE_COUNT && !analysis.shouldBlock,
      detail: analysis.detail,
    };
  }

  await recordGpsSpoofLog({
    userId: opts.userId,
    user: opts.user,
    action: "punch_in",
    outcome: "blocked",
    flags: analysis.flags,
    lat: opts.lat,
    lng: opts.lng,
    accuracy: opts.accuracy ?? null,
    sampleCount: probes.length,
    maxSpreadM: analysis.maxSpreadM,
    detail: analysis.detail,
    attendanceId: open.id,
  });

  await closeOpenAttendance({
    userId: opts.userId,
    lat: opts.lat,
    lng: opts.lng,
    accuracy: opts.accuracy ?? null,
    reason: "gps_spoof",
    address: "Auto punch-out: fake GPS detected (random location checks)",
  });

  return {
    ok: false as const,
    blocked: true as const,
    error: "Fake GPS detected. Turn off location spoofing apps and punch from your real field location.",
    code: "GPS_SPOOF" as const,
    flags: analysis.flags,
  };
}
