/**
 * Lightweight self-checks for location integrity helpers (run: npx tsx src/lib/locationIntegrity/selfcheck.ts)
 */
import { computeRiskScore } from "./riskScore";
import { findImpossibleTravel } from "./impossibleTravel";
import { haversineMeters } from "./haversine";
import { securityStatusFromScore } from "./types";
import { computePunchRequestHash } from "./challenge";
import { interpretSideloadIntegrityVerdicts } from "./playIntegrity";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

{
  const r = computeRiskScore({
    directMockSampleCount: 0,
    playIntegrityFailed: false,
    playIntegrityStrongTamper: false,
    impossibleTravelCount: 0,
    teleportPatternCount: 0,
    sensorMismatchCount: 0,
    vpnActive: false,
  });
  assert(r.securityStatus === "NORMAL" && r.riskScore === 0, "genuine should be NORMAL");
}

{
  const r = computeRiskScore({
    directMockSampleCount: 0,
    playIntegrityFailed: false,
    playIntegrityStrongTamper: false,
    impossibleTravelCount: 0,
    teleportPatternCount: 0,
    sensorMismatchCount: 0,
    vpnActive: true,
  });
  assert(r.riskScore === 5 && r.securityStatus === "NORMAL", "VPN alone must not be HIGH");
}

{
  const r = computeRiskScore({
    directMockSampleCount: 1,
    playIntegrityFailed: false,
    playIntegrityStrongTamper: false,
    impossibleTravelCount: 0,
    teleportPatternCount: 0,
    sensorMismatchCount: 0,
    vpnActive: false,
  });
  assert(r.riskScore >= 100 && r.securityStatus === "DIRECT_MOCK_SIGNAL", "mock OS signal");
}

{
  const jumps = findImpossibleTravel([
    { lat: 28.6139, lng: 77.209, atMs: 1_000_000 },
    { lat: 19.076, lng: 72.8777, atMs: 1_000_000 + 60_000 },
  ]);
  assert(jumps.length === 1, "expected impossible travel");
  assert(haversineMeters(28.6139, 77.209, 19.076, 72.8777) > 100_000, "distance sanity");
}

{
  const jumps = findImpossibleTravel([
    { lat: 30.9, lng: 75.8, atMs: 1 },
    { lat: 30.90001, lng: 75.80001, atMs: 1 + 30 * 60_000 },
  ]);
  assert(jumps.length === 0, "stationary must not flag travel");
}

{
  const a = computePunchRequestHash({
    punchId: "p_abc",
    employeeId: "u1",
    attendanceSessionId: "att1",
    punchType: "punch_in",
    challenge: "chal",
  });
  const b = computePunchRequestHash({
    punchId: "p_abc",
    employeeId: "u1",
    attendanceSessionId: "att1",
    punchType: "punch_in",
    challenge: "chal",
  });
  assert(a === b && a.length === 64, "requestHash must be stable sha256 hex");
  const c = computePunchRequestHash({
    punchId: "p_abc",
    employeeId: "u1",
    attendanceSessionId: "",
    punchType: "punch_in",
    challenge: "chal",
  });
  assert(a !== c, "attendanceSessionId must bind the hash");
}

assert(securityStatusFromScore(15, false) === "NORMAL", "status band");
assert(securityStatusFromScore(25, false) === "WATCH", "status band watch");
assert(securityStatusFromScore(60, false) === "HIGH_RISK", "status band high");
assert(securityStatusFromScore(10, true) === "DIRECT_MOCK_SIGNAL", "direct mock overrides");

{
  const sideload = interpretSideloadIntegrityVerdicts({
    appRecognitionVerdict: "UNRECOGNIZED_VERSION",
    appLicensingVerdict: "UNLICENSED",
    deviceRecognitionVerdict: [],
    packageNameMatch: true,
    hashMatch: true,
  });
  assert(sideload.status === "OK" && !sideload.fraudRelevant && !sideload.strongTamper, "sideload verdicts not fraud");
}

{
  const uneval = interpretSideloadIntegrityVerdicts({
    appRecognitionVerdict: "UNEVALUATED",
    appLicensingVerdict: "UNEVALUATED",
    deviceRecognitionVerdict: null,
    packageNameMatch: null,
    hashMatch: null,
  });
  assert(uneval.status === "OK" && !uneval.fraudRelevant, "UNEVALUATED not fraud");
}

{
  const r = computeRiskScore({
    directMockSampleCount: 0,
    playIntegrityFailed: true,
    playIntegrityStrongTamper: true,
    impossibleTravelCount: 0,
    teleportPatternCount: 0,
    sensorMismatchCount: 0,
    vpnActive: false,
  });
  assert(r.riskScore === 5 && r.securityStatus === "NORMAL", "Integrity alone must stay NORMAL for sideload");
}

console.log("locationIntegrity selfcheck: OK");
