import { securityStatusFromScore, type SecurityStatus } from "./types";

/** Admin prioritization only — never blocks punch. */
export type RiskBreakdown = {
  riskScore: number;
  securityStatus: SecurityStatus;
  reasons: string[];
  mockLocationDetected: boolean;
  directMockSampleCount: number;
};

const MOCK_CAP_EXTRA = 80; // +20 per extra mock after first, capped

/**
 * Primary fake-location evidence = Android OS isMock.
 * Play Integrity is optional/supporting only (sideloaded APK may return
 * UNLICENSED / UNRECOGNIZED_VERSION / UNEVALUATED — never fraud by themselves).
 */
export function computeRiskScore(input: {
  directMockSampleCount: number;
  playIntegrityFailed: boolean;
  playIntegrityStrongTamper: boolean;
  impossibleTravelCount: number;
  teleportPatternCount: number;
  sensorMismatchCount: number;
  vpnActive: boolean;
}): RiskBreakdown {
  const reasons: string[] = [];
  let score = 0;
  const mocks = Math.max(0, input.directMockSampleCount | 0);

  if (mocks > 0) {
    score += 100;
    reasons.push("DIRECT OS MOCK SIGNAL: Android OS reported location as mock (isMock=true)");
    const extra = Math.min(MOCK_CAP_EXTRA, Math.max(0, mocks - 1) * 20);
    score += extra;
    if (extra > 0) reasons.push(`Additional mock samples in session (+${extra})`);
  }

  // Integrity binding anomalies only (hash/package) — light supporting weight.
  // Never treat sideload app/license verdicts as fraud via these flags.
  if (input.playIntegrityFailed || input.playIntegrityStrongTamper) {
    score += 5;
    reasons.push(
      "Play Integrity supporting signal only (sideloaded APK — not fraud by itself; Play Console not required)"
    );
  }

  if (input.impossibleTravelCount > 0) {
    score += 30;
    reasons.push(`Impossible travel detected (${input.impossibleTravelCount})`);
  }
  if (input.teleportPatternCount > 0) {
    score += 25;
    reasons.push(`Repeated teleport-style jumps (${input.teleportPatternCount})`);
  }
  if (input.sensorMismatchCount > 0) {
    score += 20;
    reasons.push(`Sensor/location mismatch (${input.sensorMismatchCount})`);
  }
  if (input.vpnActive) {
    score += 5;
    reasons.push("VPN transport active (supporting only)");
  }

  return {
    riskScore: score,
    securityStatus: securityStatusFromScore(score, mocks > 0),
    reasons,
    mockLocationDetected: mocks > 0,
    directMockSampleCount: mocks,
  };
}
