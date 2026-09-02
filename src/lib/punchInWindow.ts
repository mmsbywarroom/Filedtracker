import { istMinutesOfDay } from "@/lib/dailyAttendance";

/** Punch-in allowed from 5:00 AM IST (inclusive). */
export const PUNCH_IN_START_MINUTES = 5 * 60;
/** Punch-in allowed until 1:00 PM IST (exclusive — 1:00 PM and later blocked). */
export const PUNCH_IN_END_MINUTES = 13 * 60;

export function isWithinPunchInWindow(now = new Date()) {
  const m = istMinutesOfDay(now);
  return m >= PUNCH_IN_START_MINUTES && m < PUNCH_IN_END_MINUTES;
}

export function punchInWindowMessage() {
  return "Punch in is only allowed between 5:00 AM and 1:00 PM (IST).";
}
