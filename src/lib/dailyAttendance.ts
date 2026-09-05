import { AUTO_PUNCH_OUT_MS } from "@/lib/punchOut";

export const ATTENDANCE_STATUSES = ["present", "half_day", "absent", "leave"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
/** Display-only: no punch yet, and 1:00 PM IST cutoff has not passed. */
export type ResolvedAttendanceStatus = AttendanceStatus | "pending";

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

/** 1:00 PM IST on the given calendar day — no-punch users become Absent after this. */
export function noPunchAbsentCutoff(dateYmd: string) {
  return new Date(`${dateYmd}T13:00:00+05:30`);
}

export function isAfterNoPunchAbsentCutoff(dateYmd: string, now = new Date()) {
  return now.getTime() >= noPunchAbsentCutoff(dateYmd).getTime();
}

/**
 * Dashboard summary label for the absent bucket:
 * before 1:00 PM IST on that day → "In progress"; from 1:00 PM → "Absent".
 * Past calendar days always show "Absent".
 */
export function absentOrInProgressLabel(dateYmd: string, now = new Date()) {
  const today = istDateString(now);
  if (dateYmd < today) return "Absent";
  if (!isAfterNoPunchAbsentCutoff(dateYmd, now)) return "In progress";
  return "Absent";
}

export function absentOrInProgressHint(dateYmd: string, now = new Date()) {
  if (absentOrInProgressLabel(dateYmd, now) === "In progress") {
    return "Duty still running — after 1:00 PM this becomes Absent (no punch / late / under 6h)";
  }
  return "After 1:00 PM: no punch, late punch, or under 6h";
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
 * - after 1:00 PM or no punch (after 1:00 PM) or early punch with <6h → absent
 * No punch before 1:00 PM is handled in resolveDayAttendanceStatus as pending.
 *
 * HALF_DAY_WAIVER_DATES: outage days — punch after 10:30 still counts toward Present
 * (hours rules unchanged).
 */
const HALF_DAY_WAIVER_DATES = new Set([
  "2026-09-05", // server/DNS outage morning — do not mark half-day for late punch-in
]);

export function isHalfDayWaivedForDate(dateYmd: string) {
  return HALF_DAY_WAIVER_DATES.has(dateYmd);
}

export function autoAttendanceStatus(opts: {
  firstPunchIn: Date | null;
  hours: number;
  hadPunch: boolean;
}): AttendanceStatus {
  if (!opts.hadPunch || !opts.firstPunchIn) return "absent";
  const mins = istMinutesOfDay(opts.firstPunchIn);
  if (mins > HALF_DAY_PUNCH_BEFORE_MINUTES) return "absent";
  const punchDay = istDateString(opts.firstPunchIn);
  const waiveHalfDay = isHalfDayWaivedForDate(punchDay);
  if (mins > PRESENT_PUNCH_BEFORE_MINUTES && !waiveHalfDay) return "half_day";
  if (opts.hours >= PRESENT_MIN_HOURS) return "present";
  return "absent";
}

export function statusLabel(status: ResolvedAttendanceStatus) {
  if (status === "present") return "Present";
  if (status === "half_day") return "Half-day";
  if (status === "leave") return "Leave";
  if (status === "pending") return "Pending punch-in";
  return "Absent";
}

export function autoReason(
  status: AttendanceStatus,
  hours: number,
  hadPunch: boolean,
  onLeave: boolean,
  firstPunchIn: Date | null,
  sessionCount = 1
) {
  if (onLeave) return "Approved leave for this date";
  if (!hadPunch || !firstPunchIn) return "No punch-in on this date";
  const punchLabel = firstPunchIn.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });
  const sessionsNote =
    sessionCount > 1 ? ` · ${sessionCount} sessions combined` : "";
  if (status === "present") {
    const punchDay = firstPunchIn ? istDateString(firstPunchIn) : "";
    const waived = punchDay && isHalfDayWaivedForDate(punchDay);
    if (waived && istMinutesOfDay(firstPunchIn!) > PRESENT_PUNCH_BEFORE_MINUTES) {
      return `First punch ${punchLabel} · ${hours.toFixed(1)}h on duty${sessionsNote} (10:30 half-day waived for outage day)`;
    }
    return `First punch ${punchLabel} (by 10:30) · ${hours.toFixed(1)}h on duty${sessionsNote} (6–12h = present)`;
  }
  if (status === "half_day") {
    return `First punch ${punchLabel} (after 10:30, by 1:00) = half-day${sessionsNote}`;
  }
  const mins = istMinutesOfDay(firstPunchIn);
  if (mins > HALF_DAY_PUNCH_BEFORE_MINUTES) {
    return `First punch ${punchLabel} (after 1:00) = absent${sessionsNote}`;
  }
  if (mins <= PRESENT_PUNCH_BEFORE_MINUTES && hours < PRESENT_MIN_HOURS) {
    return `First punch ${punchLabel} but only ${hours.toFixed(1)}h combined${sessionsNote} (need 6–12h for present)`;
  }
  return `First punch ${punchLabel} · ${hours.toFixed(1)}h${sessionsNote} = absent`;
}

/** Resolve final day status (manual mark → holiday → leave → auto punch rules). */
export function resolveDayAttendanceStatus(opts: {
  sessions: PunchRow[];
  asOf?: Date;
  dateYmd?: string;
  onApprovedLeave: boolean;
  isHoliday?: boolean;
  holidayReason?: string | null;
  manual?: { status: string; source: string; note?: string | null } | null;
}): {
  status: ResolvedAttendanceStatus;
  source: "auto" | "manual";
  reason: string;
  hours: number;
  firstIn: Date | null;
  sessionCount: number;
} {
  const asOf = opts.asOf ?? new Date();
  const dateYmd = opts.dateYmd ?? istDateString(asOf);
  const hours = hoursWorkedOnDay(opts.sessions, asOf);
  const hadPunch = opts.sessions.length > 0;
  const firstIn = firstPunchIn(opts.sessions);
  const sessionCount = opts.sessions.length;
  const manual = opts.manual;

  if (manual?.source === "manual" && ATTENDANCE_STATUSES.includes(manual.status as AttendanceStatus)) {
    return {
      status: manual.status as AttendanceStatus,
      source: "manual",
      reason: manual.note || "Marked manually by admin",
      hours,
      firstIn,
      sessionCount,
    };
  }
  if (opts.isHoliday) {
    return {
      status: "leave",
      source: "auto",
      reason: opts.holidayReason || "Holiday for this designation",
      hours,
      firstIn,
      sessionCount,
    };
  }
  if (opts.onApprovedLeave || manual?.status === "leave") {
    return {
      status: "leave",
      source: manual?.source === "manual" ? "manual" : "auto",
      reason: manual?.note || autoReason("leave", hours, hadPunch, true, firstIn, sessionCount),
      hours,
      firstIn,
      sessionCount,
    };
  }
  if (!hadPunch && !isAfterNoPunchAbsentCutoff(dateYmd)) {
    return {
      status: "pending",
      source: "auto",
      reason: "No punch-in yet — marked Absent after 1:00 PM",
      hours,
      firstIn,
      sessionCount,
    };
  }
  const status = autoAttendanceStatus({ firstPunchIn: firstIn, hours, hadPunch });
  return {
    status,
    source: "auto",
    reason: autoReason(status, hours, hadPunch, false, firstIn, sessionCount),
    hours,
    firstIn,
    sessionCount,
  };
}
