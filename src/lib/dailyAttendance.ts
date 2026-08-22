import { AUTO_PUNCH_OUT_MS } from "@/lib/punchOut";

export const ATTENDANCE_STATUSES = ["present", "absent", "leave"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** Below this many hours punched → auto absent */
export const ABSENT_MAX_HOURS = 6;
/** 8–12 hours punched → auto present */
export const PRESENT_MIN_HOURS = 8;
export const PRESENT_MAX_HOURS = 12;

export function istDateString(d = new Date()) {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function istDayBounds(dateYmd: string) {
  return {
    start: new Date(`${dateYmd}T00:00:00+05:30`),
    end: new Date(`${dateYmd}T23:59:59.999+05:30`),
    dateOnly: new Date(`${dateYmd}T00:00:00.000Z`),
  };
}

type PunchRow = {
  punchInAt: Date;
  punchOutAt: Date | null;
};

/** Total hours worked on a calendar day (IST), capping open sessions at 12h auto rule. */
export function hoursWorkedOnDay(sessions: PunchRow[], asOf = new Date()) {
  let totalMs = 0;
  for (const s of sessions) {
    const end = s.punchOutAt ?? new Date(Math.min(asOf.getTime(), s.punchInAt.getTime() + AUTO_PUNCH_OUT_MS));
    const ms = Math.max(0, end.getTime() - s.punchInAt.getTime());
    totalMs += ms;
  }
  return totalMs / (1000 * 60 * 60);
}

export function autoAttendanceStatus(hours: number, hadPunch: boolean): AttendanceStatus {
  if (!hadPunch) return "absent";
  if (hours >= PRESENT_MIN_HOURS && hours <= PRESENT_MAX_HOURS) return "present";
  if (hours <= ABSENT_MAX_HOURS) return "absent";
  // 6–8 hours or >12 hours: treat as absent until admin marks manually
  if (hours > PRESENT_MAX_HOURS) return "present";
  return "absent";
}

export function statusLabel(status: AttendanceStatus) {
  if (status === "present") return "Present";
  if (status === "leave") return "Leave";
  return "Absent";
}

export function autoReason(status: AttendanceStatus, hours: number, hadPunch: boolean, onLeave: boolean) {
  if (onLeave) return "Approved leave for this date";
  if (!hadPunch) return "No punch-in on this date";
  if (status === "present") return `Punched ${hours.toFixed(1)}h (${PRESENT_MIN_HOURS}–${PRESENT_MAX_HOURS}h = present)`;
  if (hours <= ABSENT_MAX_HOURS) return `Punched only ${hours.toFixed(1)}h (≤${ABSENT_MAX_HOURS}h = absent)`;
  if (hours > PRESENT_MAX_HOURS) return `Punched ${hours.toFixed(1)}h (> ${PRESENT_MAX_HOURS}h = present)`;
  return `Punched ${hours.toFixed(1)}h (${ABSENT_MAX_HOURS}–${PRESENT_MIN_HOURS}h = absent, mark manually if needed)`;
}
