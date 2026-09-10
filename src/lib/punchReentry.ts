import { istDateString, istDayBounds, noPunchAbsentCutoff } from "@/lib/dailyAttendance";
import { canPunchInNow, punchInWindowMessage } from "@/lib/punchInWindow";
import { prisma } from "@/lib/prisma";

/**
 * Afternoon re-entry helper (optional messaging): if the user punched before 1:00 PM,
 * was punched out, and has no open session, they may punch in again.
 * Punch-in after 1:00 PM is allowed for everyone via the main window (from 5:00 AM).
 * Day hours always sum all sessions; Present/Half-day uses first punch + combined hours.
 */
export async function hasEligibleReentryToday(userId: string, now = new Date()) {
  const day = istDateString(now);
  const { start, end } = istDayBounds(day);
  const cutoff = noPunchAbsentCutoff(day);

  const open = await prisma.attendance.findFirst({
    where: { userId, punchOutAt: null },
    select: { id: true },
  });
  if (open) return false;

  const morningPunch = await prisma.attendance.findFirst({
    where: {
      userId,
      punchInAt: { gte: start, lt: cutoff },
    },
    select: { id: true },
  });
  if (!morningPunch) return false;

  const closedToday = await prisma.attendance.findFirst({
    where: {
      userId,
      punchInAt: { gte: start, lte: end },
      punchOutAt: { not: null },
    },
    select: { id: true },
  });
  return Boolean(closedToday);
}

export async function canUserPunchIn(userId: string, phone?: string | null, now = new Date()) {
  if (canPunchInNow(phone, now)) {
    return { allowed: true as const, reason: "window" as const };
  }
  if (await hasEligibleReentryToday(userId, now)) {
    return { allowed: true as const, reason: "reentry" as const };
  }
  return { allowed: false as const, reason: "window" as const };
}

export function punchInDeniedMessage() {
  return punchInWindowMessage();
}

export function punchInReentryMessage() {
  return "Re-entry: you punched in before 1:00 PM and were punched out — hours from all sessions today will be added together (need ≥6.5h for Present if first punch was by 1:00 PM).";
}
