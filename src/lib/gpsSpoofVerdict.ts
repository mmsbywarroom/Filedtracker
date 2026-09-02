import type { GpsSpoofFlag } from "@/lib/gpsAntiSpoof";
import { haversineMeters } from "@/lib/utils";

function gpsTrackSpreadM(samples: { lat: number; lng: number }[]) {
  if (samples.length < 2) return 0;
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      max = Math.max(max, haversineMeters(samples[i], samples[j]));
    }
  }
  return max;
}

export type GpsSample = { lat: number; lng: number; accuracy: number | null; at?: number };

/** Real phones often report accuracy above this even when coords look stable. */
export const GPS_REAL_PHONE_ACC_M = Number(process.env.GPS_REAL_PHONE_ACC_M || 5);
/** Accuracy range (max−min) typical on real devices across many fixes. */
export const GPS_REAL_ACC_RANGE_M = Number(process.env.GPS_REAL_ACC_RANGE_M || 3);
/** All readings at or below this with low variance ⇒ spoof-app pattern. */
export const GPS_SPOOF_PERFECT_ACC_M = Number(process.env.GPS_SPOOF_PERFECT_ACC_M || 3);
/** Max accuracy variance when coords stay pinned — below this looks injected. */
export const GPS_SPOOF_STABLE_ACC_RANGE_M = Number(process.env.GPS_SPOOF_STABLE_ACC_RANGE_M || 1.5);
export const GPS_PINNED_SPREAD_M = Number(process.env.GPS_PINNED_SPREAD_M || 2);
export const GPS_MIN_CONVICTION_SAMPLES = Number(process.env.GPS_MIN_CONVICTION_SAMPLES || 8);
export const GPS_MIN_CONVICTION_RANDOM = Number(process.env.GPS_MIN_CONVICTION_RANDOM || 6);

export type SpoofEvidence = {
  sampleCount: number;
  spreadM: number;
  mapSpreadM: number;
  accMin: number | null;
  accMax: number | null;
  accRange: number | null;
  pinned: boolean;
  fakePerfectAcc: boolean;
  stableInjectedAcc: boolean;
  realPhoneSignature: boolean;
  safeHarborReasons: string[];
  randomProbeCount: number;
  randomProbesPinned: boolean;
  randomProbesFakePerfect: boolean;
  observeMinutes: number;
};

function accuracyStats(samples: GpsSample[]) {
  const accuracies = samples
    .map((s) => s.accuracy)
    .filter((a): a is number => a != null && Number.isFinite(a));
  if (!accuracies.length) {
    return { accMin: null, accMax: null, accRange: null, count: 0 };
  }
  const accMin = Math.min(...accuracies);
  const accMax = Math.max(...accuracies);
  return { accMin, accMax, accRange: accMax - accMin, count: accuracies.length };
}

/** Real-user safe harbor — any one of these means do NOT block. */
export function isRealPhoneSignature(
  samples: GpsSample[],
  mapSpreadM = 0,
  travelM = 0
): { real: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const spread = Math.max(gpsTrackSpreadM(samples), mapSpreadM);

  if (spread >= GPS_PINNED_SPREAD_M) {
    reasons.push(`Map GPS spread ${Math.round(spread)} m (natural movement/jitter)`);
  }
  if (travelM >= 20) {
    reasons.push(`Session travel ${Math.round(travelM)} m`);
  }

  const { accMin, accMax, accRange, count } = accuracyStats(samples);
  if (accMax != null && accMax > GPS_REAL_PHONE_ACC_M) {
    reasons.push(`GPS accuracy up to ${Math.round(accMax)} m (real phone)`);
  }
  if (accRange != null && accRange >= GPS_REAL_ACC_RANGE_M && count >= 3) {
    reasons.push(`Accuracy varied ${accRange.toFixed(1)} m across readings`);
  }
  if (count > 0 && count < samples.length) {
    reasons.push("Some readings missing accuracy (typical browser GPS)");
  }

  return { real: reasons.length > 0, reasons };
}

export function buildSpoofEvidence(opts: {
  samples: GpsSample[];
  mapSpreadM?: number;
  travelM?: number;
  randomProbes?: GpsSample[];
  observeMs?: number;
}): SpoofEvidence {
  const mapSpreadM = opts.mapSpreadM ?? 0;
  const spreadM = Math.max(gpsTrackSpreadM(opts.samples), mapSpreadM);
  const { accMin, accMax, accRange, count: accCount } = accuracyStats(opts.samples);
  const pinned = spreadM < GPS_PINNED_SPREAD_M;

  const withAcc = opts.samples.filter((s) => s.accuracy != null).length;
  const fakePerfectAcc =
    withAcc >= GPS_MIN_CONVICTION_SAMPLES &&
    accCount >= GPS_MIN_CONVICTION_SAMPLES &&
    accMin != null &&
    accMax != null &&
    accMax <= GPS_SPOOF_PERFECT_ACC_M;

  const stableInjectedAcc =
    fakePerfectAcc &&
    accRange != null &&
    accRange <= GPS_SPOOF_STABLE_ACC_RANGE_M;

  const safe = isRealPhoneSignature(opts.samples, mapSpreadM, opts.travelM ?? 0);

  const randomSamples = opts.randomProbes ?? [];
  const randomProbeCount = randomSamples.length;
  const randomSpread = gpsTrackSpreadM(randomSamples);
  const randomAcc = accuracyStats(randomSamples);
  const randomProbesPinned =
    randomProbeCount >= GPS_MIN_CONVICTION_RANDOM && randomSpread < GPS_PINNED_SPREAD_M;
  const randomProbesFakePerfect =
    randomProbeCount >= GPS_MIN_CONVICTION_RANDOM &&
    randomAcc.count >= GPS_MIN_CONVICTION_RANDOM &&
    randomAcc.accMax != null &&
    randomAcc.accMax <= GPS_SPOOF_PERFECT_ACC_M &&
    randomAcc.accRange != null &&
    randomAcc.accRange <= GPS_SPOOF_STABLE_ACC_RANGE_M;

  return {
    sampleCount: opts.samples.length,
    spreadM,
    mapSpreadM,
    accMin,
    accMax,
    accRange,
    pinned,
    fakePerfectAcc,
    stableInjectedAcc,
    realPhoneSignature: safe.real,
    safeHarborReasons: safe.reasons,
    randomProbeCount,
    randomProbesPinned,
    randomProbesFakePerfect,
    observeMinutes: Math.round((opts.observeMs ?? 0) / 60000),
  };
}

export type SpoofVerdict = {
  shouldBlock: boolean;
  flags: GpsSpoofFlag[];
  detail: string;
  score: number;
  evidence: SpoofEvidence;
};

/**
 * Full-proof conviction: block ONLY when multiple independent spoof signals align
 * AND real-phone safe harbor did NOT trigger.
 */
export function convictSpoofIfProven(evidence: SpoofEvidence): SpoofVerdict {
  if (evidence.realPhoneSignature) {
    return {
      shouldBlock: false,
      flags: [],
      detail: `Real phone GPS confirmed: ${evidence.safeHarborReasons.join("; ")}`,
      score: 0,
      evidence,
    };
  }

  const flags: GpsSpoofFlag[] = [];
  let score = 0;

  if (evidence.pinned) {
    flags.push("duplicate_coordinates");
    score += 25;
  }
  if (evidence.fakePerfectAcc) {
    flags.push("suspicious_perfect_accuracy");
    score += 30;
  }
  if (evidence.stableInjectedAcc) score += 20;
  if (evidence.sampleCount >= GPS_MIN_CONVICTION_SAMPLES) score += 10;
  if (evidence.randomProbesPinned && evidence.randomProbesFakePerfect) {
    flags.push("random_probe_pinned");
    score += 35;
  }

  const observationConviction =
    evidence.pinned &&
    evidence.stableInjectedAcc &&
    evidence.sampleCount >= GPS_MIN_CONVICTION_SAMPLES &&
    evidence.observeMinutes >= 25;

  const randomConviction =
    evidence.randomProbesPinned &&
    evidence.randomProbesFakePerfect &&
    evidence.randomProbeCount >= GPS_MIN_CONVICTION_RANDOM;

  const shouldBlock = observationConviction || randomConviction;

  const detailParts: string[] = [];
  if (shouldBlock) {
    detailParts.push(`VERDICT: Fake GPS (${score}/100)`);
    detailParts.push(
      `Pinned ${Math.round(evidence.spreadM)} m spread · accuracy ${evidence.accMin?.toFixed(1)}–${evidence.accMax?.toFixed(1)} m (range ${evidence.accRange?.toFixed(1)} m)`
    );
    detailParts.push(`${evidence.sampleCount} map samples over ~${evidence.observeMinutes} min`);
    if (randomConviction) {
      detailParts.push(`${evidence.randomProbeCount} random checks all pinned with fake-perfect accuracy`);
    }
    if (observationConviction) {
      detailParts.push("30 min observation: pinned coords + injected accuracy pattern");
    }
    detailParts.push("Real-phone safe harbor: not met (no natural accuracy variance or movement)");
  } else if (evidence.pinned && !evidence.stableInjectedAcc) {
    detailParts.push(
      `Stationary ${Math.round(evidence.spreadM)} m spread but natural GPS accuracy (${evidence.accMin?.toFixed(0)}–${evidence.accMax?.toFixed(0)} m) — real user, no block`
    );
  } else {
    detailParts.push("Insufficient spoof evidence — no block");
  }

  return {
    shouldBlock,
    flags: shouldBlock ? Array.from(new Set(flags)) : [],
    detail: detailParts.join(" · "),
    score: shouldBlock ? score : 0,
    evidence,
  };
}

export function parseMapProbeLog(raw: unknown): GpsSample[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => ({
      lat: Number((p as GpsSample)?.lat),
      lng: Number((p as GpsSample)?.lng),
      accuracy:
        (p as GpsSample)?.accuracy != null && Number.isFinite(Number((p as GpsSample).accuracy))
          ? Number((p as GpsSample).accuracy)
          : null,
      at:
        (p as GpsSample)?.at != null && Number.isFinite(Number((p as GpsSample).at))
          ? Number((p as GpsSample).at)
          : undefined,
    }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
}

export function mergeMapProbeLog(existing: unknown, incoming: GpsSample[], cap = 80): GpsSample[] {
  const merged = [...parseMapProbeLog(existing), ...incoming];
  return merged.slice(-cap);
}
