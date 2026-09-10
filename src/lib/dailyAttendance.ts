import { AUTO_PUNCH_OUT_MS } from "@/lib/punchOut";

export const ATTENDANCE_STATUSES = ["present", "half_day", "absent", "leave"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
/** Display-only: no punch yet, and 1:00 PM IST cutoff has not passed. */
export type ResolvedAttendanceStatus = AttendanceStatus | "pending";

/** Punch in by this IST time + ≥6.5h worked → Present (when first punch is on time). */
export const PRESENT_PUNCH_BEFORE_MINUTES = 10 * 60 + 30; // 10:30 AM
/** After this IST time, a first punch of the day is treated as late (Half-day). */
export const HALF_DAY_PUNCH_BEFORE_MINUTES = 13 * 60; // 1:00 PM
/** Min combined hours on duty for Present (6 hours 30 minutes). */
export const PRESENT_MIN_HOURS = 6.5;
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
    return "Duty still running — after 1:00 PM this becomes Absent if there is still no punch";
  }
  return "No punch-in by 1:00 PM (or incomplete early duty under 6.5h)";
}

export function firstPunchIn(sessions: PunchRow[]) {
  if (!sessions.length) return null;
  return sessions.reduce((a, b) => (a.punchInAt < b.punchInAt ? a : b)).punchInAt;
}

/** True if any session started before 1:00 PM IST (eligible for Present via combined hours). */
export function hadMorningWindowPunch(sessions: PunchRow[]) {
  return sessions.some((s) => istMinutesOfDay(s.punchInAt) < HALF_DAY_PUNCH_BEFORE_MINUTES);
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
 * Auto day status from first punch-in time (IST) and combined hours (all sessions):
 * - First punch by 10:30 + ≥6.5h → Present
 * - First punch by 10:30 + under 6.5h → Absent (incomplete)
 * - First punch after 10:30 and by 1:00 + ≥6.5h → Present (sessions combined)
 * - First punch after 10:30 and by 1:00 + under 6.5h → Half-day
 * - First punch after 1:00 (no morning punch that day) → Half-day
 * - No punch after 1:00 → Absent
 *
 * HALF_DAY_WAIVER_DATES: outage days — punch after 10:30 still counts like on-time for Present.
 */
const HALF_DAY_WAIVER_DATES = new Set([
  "2026-09-05", // server/DNS outage morning — do not force half-day for late punch-in
]);

export function isHalfDayWaivedForDate(dateYmd: string) {
  return HALF_DAY_WAIVER_DATES.has(dateYmd);
}

export function autoAttendanceStatus(opts: {
  firstPunchIn: Date | null;
  hours: number;
  hadPunch: boolean;
  /** Any punch-in before 1:00 PM (enables Present when combined hours ≥ 6.5). */
  hadMorningWindowPunch?: boolean;
}): AttendanceStatus {
  if (!opts.hadPunch || !opts.firstPunchIn) return "absent";
  const mins = istMinutesOfDay(opts.firstPunchIn);
  const punchDay = istDateString(opts.firstPunchIn);
  const waiveHalfDay = isHalfDayWaivedForDate(punchDay);
  const morningOk = opts.hadMorningWindowPunch ?? mins < HALF_DAY_PUNCH_BEFORE_MINUTES;

  // Only punched at/after 1:00 PM (no session before 1:00) → Half-day always
  if (!morningOk) return "half_day";

  const onTimeOrWaived = mins <= PRESENT_PUNCH_BEFORE_MINUTES || waiveHalfDay;

  // First punch by 10:30 (or waiver day): ≥6.5h → Present, else Absent (incomplete)
  if (onTimeOrWaived) {
    return opts.hours >= PRESENT_MIN_HOURS ? "present" : "absent";
  }

  // First punch after 10:30 and before 1:00 (sessions may include afternoon re-entry):
  // ≥6.5h combined → Present, else Half-day
  return opts.hours >= PRESENT_MIN_HOURS ? "present" : "half_day";
}

export function statusLabel(status: ResolvedAttendanceStatus) {
  if (status === "present") return "Present";
  if (status === "half_day") return "Half-day";
  if (status === "leave") return "Leave";
  if (status === "pending") return "Pending punch-in";
  return "Absent";
}

function fmtHours(h: number) {
  return `${h.toFixed(1)}h`;
}

export function autoReason(
  status: AttendanceStatus,
  hours: number,
  hadPunch: boolean,
  onLeave: boolean,
  firstPunchIn: Date | null,
  sessionCount = 1,
  hadMorning = true
) {
  if (onLeave) return "Approved leave for this date";
  if (!hadPunch || !firstPunchIn) return "No punch-in on this date — marked Absent after 1:00 PM";
  const punchLabel = firstPunchIn.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });
  const sessionsNote =
    sessionCount > 1 ? ` · ${sessionCount} sessions combined (${fmtHours(hours)})` : ` · ${fmtHours(hours)} on duty`;
  const mins = istMinutesOfDay(firstPunchIn);
  const punchDay = istDateString(firstPunchIn);
  const waived = isHalfDayWaivedForDate(punchDay);

  if (status === "present") {
    if (waived && mins > PRESENT_PUNCH_BEFORE_MINUTES) {
      return `Present: first punch ${punchLabel} (10:30 half-day waived for outage day)${sessionsNote} · need ≥6.5h — met`;
    }
    if (mins <= PRESENT_PUNCH_BEFORE_MINUTES) {
      return `Present: first punch ${punchLabel} (by 10:30)${sessionsNote} · need ≥6.5h — met`;
    }
    return `Present: first punch ${punchLabel} (after 10:30, by 1:00)${sessionsNote} · combined duty ≥6.5h`;
  }

  if (status === "half_day") {
    if (!hadMorning || mins >= HALF_DAY_PUNCH_BEFORE_MINUTES) {
      return `Half-day: first punch ${punchLabel} (at/after 1:00 PM — no punch before 1:00)${sessionsNote} · late first punch is Half-day`;
    }
    if (mins > PRESENT_PUNCH_BEFORE_MINUTES && hours < PRESENT_MIN_HOURS) {
      return `Half-day: first punch ${punchLabel} (after 10:30, before 1:00)${sessionsNote} · under 6.5h (need ≥6.5h combined for Present)`;
    }
    return `Half-day: first punch ${punchLabel}${sessionsNote}`;
  }

  // Absent
  if (mins <= PRESENT_PUNCH_BEFORE_MINUTES && hours < PRESENT_MIN_HOURS) {
    return `Absent: first punch ${punchLabel} (by 10:30)${sessionsNote} · under 6.5h (need ≥6.5h for Present)`;
  }
  return `Absent: first punch ${punchLabel}${sessionsNote}`;
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
  const morning = hadMorningWindowPunch(opts.sessions);
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
    // Full Present already earned stays Present; half-day / incomplete / no punch → Holiday (leave).
    const auto = autoAttendanceStatus({
      firstPunchIn: firstIn,
      hours,
      hadPunch,
      hadMorningWindowPunch: morning,
    });
    if (auto === "present") {
      return {
        status: "present",
        source: "auto",
        reason: autoReason("present", hours, hadPunch, false, firstIn, sessionCount, morning),
        hours,
        firstIn,
        sessionCount,
      };
    }
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
      reason: manual?.note || autoReason("leave", hours, hadPunch, true, firstIn, sessionCount, morning),
      hours,
      firstIn,
      sessionCount,
    };
  }
  if (!hadPunch && !isAfterNoPunchAbsentCutoff(dateYmd)) {
    return {
      status: "pending",
      source: "auto",
      reason: "No punch-in yet — becomes Absent after 1:00 PM if still no punch",
      hours,
      firstIn,
      sessionCount,
    };
  }
  const status = autoAttendanceStatus({
    firstPunchIn: firstIn,
    hours,
    hadPunch,
    hadMorningWindowPunch: morning,
  });
  return {
    status,
    source: "auto",
    reason: autoReason(status, hours, hadPunch, false, firstIn, sessionCount, morning),
    hours,
    firstIn,
    sessionCount,
  };
}
