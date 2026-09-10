import { AUTO_PUNCH_OUT_MS } from "@/lib/punchOut";

export const ATTENDANCE_STATUSES = ["present", "half_day", "absent", "leave"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
/** Display-only: no punch yet, and 1:00 PM IST cutoff has not passed. */
export type ResolvedAttendanceStatus = AttendanceStatus | "pending";

/** Earliest valid punch-in (IST). Before this is not allowed / not counted. */
export const EARLIEST_VALID_PUNCH_MINUTES = 7 * 60; // 7:00 AM
/** First punch by this time can earn Present (with enough hours). */
export const PRESENT_PUNCH_BEFORE_MINUTES = 10 * 60 + 30; // 10:30 AM
/** After this, a first punch of the day cannot be Present (Half-day if before 1:00). */
export const HALF_DAY_PUNCH_BEFORE_MINUTES = 13 * 60; // 1:00 PM
/** Duty hours stop counting at this IST time (combined sessions). */
export const DUTY_HOURS_END_MINUTES = 20 * 60; // 8:00 PM
/** Min combined hours for Present (first punch 7:00–10:30). */
export const PRESENT_MIN_HOURS = 6.5;
/** Min combined hours for Half-day when first punch was 7:00–10:30 (below this → Absent). */
export const HALF_DAY_MIN_HOURS = 3.5;
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

/** Instant at HH:MM IST on the calendar day of `d` (or dateYmd). */
export function istTimeOnSameDay(d: Date, minutesFromMidnight: number) {
  const ymd = istDateString(d);
  const hh = String(Math.floor(minutesFromMidnight / 60)).padStart(2, "0");
  const mm = String(minutesFromMidnight % 60).padStart(2, "0");
  return new Date(`${ymd}T${hh}:${mm}:00+05:30`);
}

/** 1:00 PM IST — no-punch users become Absent after this. */
export function noPunchAbsentCutoff(dateYmd: string) {
  return new Date(`${dateYmd}T13:00:00+05:30`);
}

export function isAfterNoPunchAbsentCutoff(dateYmd: string, now = new Date()) {
  return now.getTime() >= noPunchAbsentCutoff(dateYmd).getTime();
}

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
  return "No punch-in by 1:00 PM, incomplete under 3.5h, or only punched at/after 1:00 PM";
}

/** Sessions with punch-in at/after 7:00 AM IST (midnight–7:00 punches are ignored). */
export function validSessions(sessions: PunchRow[], allowBeforeEarliest = false) {
  if (allowBeforeEarliest) return sessions.slice();
  return sessions.filter((s) => istMinutesOfDay(s.punchInAt) >= EARLIEST_VALID_PUNCH_MINUTES);
}

export function firstPunchIn(sessions: PunchRow[], allowBeforeEarliest = false) {
  const valid = validSessions(sessions, allowBeforeEarliest);
  if (!valid.length) return null;
  return valid.reduce((a, b) => (a.punchInAt < b.punchInAt ? a : b)).punchInAt;
}

/** Any valid punch-in before 1:00 PM. */
export function hadMorningWindowPunch(sessions: PunchRow[], allowBeforeEarliest = false) {
  return validSessions(sessions, allowBeforeEarliest).some(
    (s) => istMinutesOfDay(s.punchInAt) < HALF_DAY_PUNCH_BEFORE_MINUTES
  );
}

/**
 * Total hours on duty (IST): only valid sessions (punch-in ≥ 7:00 AM),
 * each segment capped at 8:00 PM the same day. Open sessions also capped by 12h auto rule.
 */
export function hoursWorkedOnDay(sessions: PunchRow[], asOf = new Date(), allowBeforeEarliest = false) {
  let totalMs = 0;
  for (const s of validSessions(sessions, allowBeforeEarliest)) {
    const dutyEnd = istTimeOnSameDay(s.punchInAt, DUTY_HOURS_END_MINUTES);
    const rawEnd =
      s.punchOutAt ?? new Date(Math.min(asOf.getTime(), s.punchInAt.getTime() + AUTO_PUNCH_OUT_MS));
    const end = new Date(Math.min(rawEnd.getTime(), dutyEnd.getTime()));
    if (end.getTime() <= s.punchInAt.getTime()) continue;
    // Punch-in at/after 8:00 PM contributes 0
    if (istMinutesOfDay(s.punchInAt) >= DUTY_HOURS_END_MINUTES) continue;
    totalMs += end.getTime() - s.punchInAt.getTime();
  }
  return totalMs / (1000 * 60 * 60);
}

/**
 * Status rules (replace prior Present/Half-day logic):
 * - First valid punch 7:00–10:30 + ≥6.5h → Present
 * - First valid punch 7:00–10:30 + 3.5–<6.5h → Half-day
 * - First valid punch 7:00–10:30 + <3.5h → Absent
 * - First valid punch after 10:30 and before 1:00 → Half-day
 * - Only punch at/after 1:00 (no earlier valid) → Absent (remark: Punched In)
 * - Multiple sessions: hours combined until 8:00 PM
 */
export function autoAttendanceStatus(opts: {
  firstPunchIn: Date | null;
  hours: number;
  hadPunch: boolean;
  hadMorningWindowPunch?: boolean;
  /** Unrestricted 24h phones: count pre-7:00 punches as on-time morning. */
  allowBeforeEarliest?: boolean;
}): AttendanceStatus {
  if (!opts.hadPunch || !opts.firstPunchIn) return "absent";
  let mins = istMinutesOfDay(opts.firstPunchIn);
  if (opts.allowBeforeEarliest && mins < EARLIEST_VALID_PUNCH_MINUTES) {
    mins = EARLIEST_VALID_PUNCH_MINUTES;
  }
  // Invalid / pre-7:00 first punch should not reach here if callers use validSessions
  if (mins < EARLIEST_VALID_PUNCH_MINUTES) return "absent";

  const morningOk = opts.hadMorningWindowPunch ?? mins < HALF_DAY_PUNCH_BEFORE_MINUTES;

  // Only punched at/after 1:00 PM → Absent (remark: Punched In)
  if (!morningOk) return "absent";

  // After 10:30 and before 1:00 → Half-day (hours do not upgrade to Present)
  if (mins > PRESENT_PUNCH_BEFORE_MINUTES) {
    return "half_day";
  }

  // 7:00–10:30 first punch: tier by combined hours (sessions summed until 8:00 PM)
  if (opts.hours >= PRESENT_MIN_HOURS) return "present";
  if (opts.hours >= HALF_DAY_MIN_HOURS) return "half_day";
  return "absent";
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
    sessionCount > 1
      ? ` · ${sessionCount} sessions combined (${fmtHours(hours)}, until 8:00 PM)`
      : ` · ${fmtHours(hours)} on duty (until 8:00 PM)`;
  const mins = istMinutesOfDay(firstPunchIn);

  if (status === "present") {
    return `Present: first punch ${punchLabel} (7:00–10:30)${sessionsNote} · ≥${PRESENT_MIN_HOURS}h met`;
  }

  if (status === "half_day") {
    if (mins > PRESENT_PUNCH_BEFORE_MINUTES && mins < HALF_DAY_PUNCH_BEFORE_MINUTES) {
      return `Half-day: first punch ${punchLabel} (after 10:30, before 1:00)${sessionsNote}`;
    }
    if (mins <= PRESENT_PUNCH_BEFORE_MINUTES && hours >= HALF_DAY_MIN_HOURS && hours < PRESENT_MIN_HOURS) {
      return `Half-day: first punch ${punchLabel} (7:00–10:30)${sessionsNote} · ${HALF_DAY_MIN_HOURS}–${PRESENT_MIN_HOURS}h (need ≥${PRESENT_MIN_HOURS}h for Present)`;
    }
    return `Half-day: first punch ${punchLabel}${sessionsNote}`;
  }

  // Absent
  if (!hadMorning || mins >= HALF_DAY_PUNCH_BEFORE_MINUTES) {
    return `Absent — Punched In: first punch ${punchLabel} (at/after 1:00 PM)${sessionsNote}`;
  }
  if (mins <= PRESENT_PUNCH_BEFORE_MINUTES && hours < HALF_DAY_MIN_HOURS) {
    return `Absent: first punch ${punchLabel} (7:00–10:30)${sessionsNote} · under ${HALF_DAY_MIN_HOURS}h (incomplete)`;
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
  /** Unrestricted 24h punch phones — count sessions before 7:00 AM. */
  allowBeforeEarliest?: boolean;
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
  const allowBefore = Boolean(opts.allowBeforeEarliest);
  const valid = validSessions(opts.sessions, allowBefore);
  const hours = hoursWorkedOnDay(opts.sessions, asOf, allowBefore);
  const hadPunch = valid.length > 0;
  const firstIn = firstPunchIn(opts.sessions, allowBefore);
  const sessionCount = valid.length;
  const morning = hadMorningWindowPunch(opts.sessions, allowBefore);
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
    const auto = autoAttendanceStatus({
      firstPunchIn: firstIn,
      hours,
      hadPunch,
      hadMorningWindowPunch: morning,
      allowBeforeEarliest: allowBefore,
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
    allowBeforeEarliest: allowBefore,
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
