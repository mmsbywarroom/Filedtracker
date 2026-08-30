import { prisma } from "@/lib/prisma";
import { istDayBounds, istDateString } from "@/lib/dailyAttendance";

export type HolidayRow = {
  id: string;
  date: Date;
  reason: string;
  designations: string[];
  createdBy: string;
};

export async function findHoliday(dateYmd: string) {
  const { dateOnly } = istDayBounds(dateYmd);
  return prisma.holiday.findUnique({ where: { date: dateOnly } });
}

export async function findHolidayToday() {
  return findHoliday(istDateString());
}

/** Holiday applies only to the listed designations. Empty list = nobody. */
export function holidayAppliesTo(
  holiday: { designations?: string[] | null } | null | undefined,
  designation: string
) {
  if (!holiday) return false;
  const dens = holiday.designations || [];
  if (!dens.length) return false;
  return dens.includes(designation);
}

export function holidayLeaveReason(reason: string, designation?: string) {
  if (designation) return `Holiday (${designation}): ${reason}`;
  return `Holiday: ${reason}`;
}
