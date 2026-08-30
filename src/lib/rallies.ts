import { prisma } from "@/lib/prisma";
import { istDateString, istDayBounds } from "@/lib/dailyAttendance";

export function rallyDateYmd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function findRallyOnDate(dateYmd = istDateString()) {
  const { dateOnly } = istDayBounds(dateYmd);
  return prisma.rally.findFirst({
    where: { scheduledDate: dateOnly },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
}

/** Today's scheduled rally, else the manually active one. */
export async function findLiveRally() {
  const today = await findRallyOnDate();
  if (today) return today;
  return prisma.rally.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" } });
}

export function isRallyOnDate(rally: { scheduledDate: Date } | null | undefined, dateYmd = istDateString()) {
  if (!rally) return false;
  return rallyDateYmd(rally.scheduledDate) === dateYmd;
}
