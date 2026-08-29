import { AUTO_PUNCH_OUT_MS } from "@/lib/punchOut";

export const ATTENDANCE_STATUSES = ["present", "half_day", "absent", "leave"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** Punch in by this IST time + 6–12h worked → Present */
export const PRESENT_PUNCH_BEFORE_MINUTES = 10 * 60 + 30; // 10:30 AM
/** Punch in after 10:30 and by this IST time → Half-day */
export const HALF_DAY_PUNCH_BEFORE_MINUTES = 13 * 60; // 1:00 PM
/** Min hours on duty (with punch by 10:30) for Present */
export const PRESENT_MIN_HOURS = 6;
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

/** Minutes from midnight IST for a timestamp */
export function istMinutesOfDay(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

export function firstPunchIn(sessions: PunchRow[]) {
  if (!sessions.length) return null;
  return sessions.reduce((a, b) => (a.punchInAt < b.punchInAt ? a : b)).punchInAt;
}

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

/**
 * Auto day status from first punch-in time (IST) and hours worked:
 * - by 10:30 + 6–12h (or >12h) → present
 * - after 10:30 and by 1:00 PM → half_day
 * - after 1:00 PM or no punch or early punch with <6h → absent
 */
export function autoAttendanceStatus(opts: {
  firstPunchIn: Date | null;
  hours: number;
  hadPunch: boolean;
}): AttendanceStatus {
  if (!opts.hadPunch || !opts.firstPunchIn) return "absent";
  const mins = istMinutesOfDay(opts.firstPunchIn);
  if (mins > HALF_DAY_PUNCH_BEFORE_MINUTES) return "absent";
  if (mins > PRESENT_PUNCH_BEFORE_MINUTES) return "half_day";
  if (opts.hours >= PRESENT_MIN_HOURS) return "present";
  return "absent";
}

export function statusLabel(status: AttendanceStatus) {
  if (status === "present") return "Present";
  if (status === "half_day") return "Half-day";
  if (status === "leave") return "Leave";
  return "Absent";
}

export function autoReason(
  status: AttendanceStatus,
  hours: number,
  hadPunch: boolean,
  onLeave: boolean,
  firstPunchIn: Date | null
) {
  if (onLeave) return "Approved leave for this date";
  if (!hadPunch || !firstPunchIn) return "No punch-in on this date";
  const punchLabel = firstPunchIn.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (status === "present") {
    return `Punch in ${punchLabel} (by 10:30) · ${hours.toFixed(1)}h on duty (6–12h = present)`;
  }
  if (status === "half_day") {
    return `Punch in ${punchLabel} (after 10:30, by 1:00) = half-day`;
  }
  const mins = istMinutesOfDay(firstPunchIn);
  if (mins > HALF_DAY_PUNCH_BEFORE_MINUTES) {
    return `Punch in ${punchLabel} (after 1:00) = absent`;
  }
  if (mins <= PRESENT_PUNCH_BEFORE_MINUTES && hours < PRESENT_MIN_HOURS) {
    return `Punch in ${punchLabel} but only ${hours.toFixed(1)}h (need 6–12h for present)`;
  }
  return `Punch in ${punchLabel} · ${hours.toFixed(1)}h = absent`;
}

/** Resolve final day status (manual mark → leave → auto punch rules). */
export function resolveDayAttendanceStatus(opts: {
  sessions: PunchRow[];
  asOf?: Date;
  onApprovedLeave: boolean;
  manual?: { status: string; source: string; note?: string | null } | null;
}): { status: AttendanceStatus; source: "auto" | "manual"; reason: string; hours: number; firstIn: Date | null } {
  const asOf = opts.asOf ?? new Date();
  const hours = hoursWorkedOnDay(opts.sessions, asOf);
  const hadPunch = opts.sessions.length > 0;
  const firstIn = firstPunchIn(opts.sessions);
  const manual = opts.manual;

  if (manual?.source === "manual" && ATTENDANCE_STATUSES.includes(manual.status as AttendanceStatus)) {
    return {
      status: manual.status as AttendanceStatus,
      source: "manual",
      reason: manual.note || "Marked manually by admin",
      hours,
      firstIn,
    };
  }
  if (opts.onApprovedLeave || manual?.status === "leave") {
    return {
      status: "leave",
      source: manual?.source === "manual" ? "manual" : "auto",
      reason: manual?.note || autoReason("leave", hours, hadPunch, true, firstIn),
      hours,
      firstIn,
    };
  }
  const status = autoAttendanceStatus({ firstPunchIn: firstIn, hours, hadPunch });
  return {
    status,
    source: "auto",
    reason: autoReason(status, hours, hadPunch, false, firstIn),
    hours,
    firstIn,
  };
}
