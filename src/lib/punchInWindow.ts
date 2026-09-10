import { EARLIEST_VALID_PUNCH_MINUTES, istMinutesOfDay } from "@/lib/dailyAttendance";
import { normalizePhone } from "@/lib/security";

/** Punch-in allowed from 7:00 AM IST (inclusive) through end of that IST day. */
export const PUNCH_IN_START_MINUTES = EARLIEST_VALID_PUNCH_MINUTES;

/** These phones may punch in/out any time (web + native), including before 7:00 AM. */
const UNRESTRICTED_PUNCH_PHONES = new Set(["9625692122"]);

function phoneDigitsLast10(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function isUnrestrictedPunchPhone(phone: string | null | undefined) {
  const n = phone ? normalizePhone(phone) : null;
  if (n && UNRESTRICTED_PUNCH_PHONES.has(n)) return true;
  const last10 = phoneDigitsLast10(phone);
  return Boolean(last10 && UNRESTRICTED_PUNCH_PHONES.has(last10));
}

/** True from 7:00 AM IST through end of that IST day (after 1:00 PM is allowed). */
export function isWithinPunchInWindow(now = new Date()) {
  return istMinutesOfDay(now) >= PUNCH_IN_START_MINUTES;
}

/** True if this user can punch in now (window or unrestricted phone). */
export function canPunchInNow(phone?: string | null, now = new Date()) {
  if (isUnrestrictedPunchPhone(phone)) return true;
  return isWithinPunchInWindow(now);
}

/** Any of the phones may unlock the 24h exception. */
export function canPunchInNowAny(phones: Array<string | null | undefined>, now = new Date()) {
  for (const p of phones) {
    if (isUnrestrictedPunchPhone(p)) return true;
  }
  return isWithinPunchInWindow(now);
}

export function punchInWindowMessage() {
  return "Punch in is allowed from 7:00 AM IST onward (including after 1:00 PM). Punch-in before 7:00 AM is not allowed.";
}
