import { istDateString, istDayBounds, noPunchAbsentCutoff } from "@/lib/dailyAttendance";
import { canPunchInNow, punchInWindowMessage } from "@/lib/punchInWindow";
import { prisma } from "@/lib/prisma";

/**
 * After the normal punch-in window (1:00 PM IST), allow punch-in again only if:
 * - user already punched in today before 1:00 PM, and
 * - that / another session is now closed (accidental / GPS / auto punch-out), and
 * - there is no open session now.
 *
 * Hours stay correct by summing closed + open segments (gap while punched out is not counted).
 * Day status still uses the first (morning) punch-in time.
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
  return "Re-entry allowed: you punched in before 1:00 PM and were punched out — hours from both sessions will be added.";
}
