/** Silent location-integrity types (admin investigation only). */

export type SecurityStatus = "NORMAL" | "WATCH" | "HIGH_RISK" | "DIRECT_MOCK_SIGNAL";

export type SecurityEventType =
  | "MOCK_LOCATION_OS_SIGNAL"
  | "PLAY_INTEGRITY_FAILURE"
  | "PLAY_INTEGRITY_OK"
  | "PLAY_INTEGRITY_UNAVAILABLE"
  | "PLAY_INTEGRITY_REQUEST_HASH_MISMATCH"
  | "IMPOSSIBLE_TRAVEL"
  | "TELEPORT_PATTERN"
  | "SENSOR_LOCATION_MISMATCH"
  | "VPN_ACTIVE"
  | "PUNCH_SAMPLE_BATCH";

export function securityStatusFromScore(score: number, hasDirectMock: boolean): SecurityStatus {
  if (hasDirectMock || score >= 100) return "DIRECT_MOCK_SIGNAL";
  if (score >= 50) return "HIGH_RISK";
  if (score >= 20) return "WATCH";
  return "NORMAL";
}
