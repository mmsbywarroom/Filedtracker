import { istDateString, istMinutesOfDay } from "@/lib/dailyAttendance";
import { normalizePhone } from "@/lib/security";

/** Punch-in allowed from 5:00 AM IST (inclusive). */
export const PUNCH_IN_START_MINUTES = 5 * 60;
/** Punch-in allowed until 1:00 PM IST (exclusive — 1:00 PM and later blocked). */
export const PUNCH_IN_END_MINUTES = 13 * 60;

/**
 * IST calendar days where punch-in is allowed after 1:00 PM (until midnight).
 * No APK change — server gate only. Remove dates after the outage day.
 */
const PUNCH_IN_LATE_ALLOW_DATES = new Set([
  "2026-09-05", // field outage / late punch day — same APK, server roll-out
]);

/** These phones may punch in/out any time (web + native), no 5 AM–1 PM window. */
const UNRESTRICTED_PUNCH_PHONES = new Set(["9625692122"]);

export function isUnrestrictedPunchPhone(phone: string | null | undefined) {
  const n = phone ? normalizePhone(phone) : null;
  return Boolean(n && UNRESTRICTED_PUNCH_PHONES.has(n));
}

export function isWithinPunchInWindow(now = new Date()) {
  const m = istMinutesOfDay(now);
  if (m < PUNCH_IN_START_MINUTES) return false;
  if (m < PUNCH_IN_END_MINUTES) return true;
  // After 1:00 PM — only on explicit waiver days (until end of that IST day).
  return PUNCH_IN_LATE_ALLOW_DATES.has(istDateString(now));
}

/** True if this user can punch in now (window or unrestricted phone). */
export function canPunchInNow(phone?: string | null, now = new Date()) {
  if (isUnrestrictedPunchPhone(phone)) return true;
  return isWithinPunchInWindow(now);
}

export function punchInWindowMessage() {
  return "Punch in is only allowed between 5:00 AM and 1:00 PM (IST).";
}
