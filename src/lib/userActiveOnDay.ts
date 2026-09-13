import { istDateString } from "@/lib/dailyAttendance";

/**
 * Whether a user should appear in attendance counts / lists for a given IST day.
 * From the IST calendar day they were marked inactive onward → not eligible.
 * Days before that → still show (historical record).
 */
export function isAttendanceEligibleOnDay(opts: {
  isActive: boolean;
  deactivatedAt?: Date | string | null;
  dateYmd: string;
}): boolean {
  const { isActive, deactivatedAt, dateYmd } = opts;
  if (deactivatedAt) {
    const deact =
      deactivatedAt instanceof Date ? deactivatedAt : new Date(deactivatedAt);
    if (!Number.isNaN(deact.getTime())) {
      const deactYmd = istDateString(deact);
      // Deactivation day and after: hide / do not count
      if (dateYmd >= deactYmd) return false;
      return true;
    }
  }
  // No timestamp: currently inactive → exclude; active → include
  return isActive;
}
