import { istMinutesOfDay } from "@/lib/dailyAttendance";
import { normalizePhone } from "@/lib/security";

/** Punch-in allowed from 5:00 AM IST (inclusive) through end of that IST day. */
export const PUNCH_IN_START_MINUTES = 5 * 60;

/** These phones may punch in/out any time (web + native), including before 5:00 AM. */
const UNRESTRICTED_PUNCH_PHONES = new Set(["9625692122"]);

export function isUnrestrictedPunchPhone(phone: string | null | undefined) {
  const n = phone ? normalizePhone(phone) : null;
  return Boolean(n && UNRESTRICTED_PUNCH_PHONES.has(n));
}

/** True from 5:00 AM IST through end of that IST day (after 1:00 PM is allowed). */
export function isWithinPunchInWindow(now = new Date()) {
  return istMinutesOfDay(now) >= PUNCH_IN_START_MINUTES;
}

/** True if this user can punch in now (window or unrestricted phone). */
export function canPunchInNow(phone?: string | null, now = new Date()) {
  if (isUnrestrictedPunchPhone(phone)) return true;
  return isWithinPunchInWindow(now);
}

export function punchInWindowMessage() {
  return "Punch in is allowed from 5:00 AM IST onward (including after 1:00 PM). Before 5:00 AM is not allowed.";
}
