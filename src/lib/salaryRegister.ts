import { istDateString, type ResolvedAttendanceStatus } from "@/lib/dailyAttendance";

export function monthDayList(year: number, month: number) {
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, "0");
  const days: string[] = [];
  for (let d = 1; d <= last; d++) {
    days.push(`${year}-${mm}-${String(d).padStart(2, "0")}`);
  }
  return days;
}

export function istClock(d: Date | null) {
  if (!d) return "";
  return d.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function shortReason(reason: string) {
  const t = reason
    .replace(/^No punch-in on this date$/i, "No punch")
    .replace(/^No punch-in yet — marked Absent after 1:00 PM$/i, "Pending till 1:00")
    .replace(/^Approved leave for this date$/i, "Approved leave")
    .replace(/^Holiday \([^)]+\):\s*/i, "Holiday: ")
    .replace(/^Marked manually by admin$/i, "Manual")
    .replace(/^First punch (.+) \(after 1:00\) = absent.*/i, "Late punch $1")
    .replace(/^First punch (.+) but only .*/i, "Under 6h · $1");
  return t.length > 48 ? `${t.slice(0, 46)}…` : t;
}

/** Corporate salary cell: P/HD with time, A with reason, L with reason. */
export function salaryCell(opts: {
  status: ResolvedAttendanceStatus;
  firstIn: Date | null;
  reason: string;
  dateYmd: string;
  todayYmd?: string;
}) {
  const today = opts.todayYmd ?? istDateString();
  if (opts.dateYmd > today) return "";
  const time = istClock(opts.firstIn);
  if (opts.status === "pending") return "";
  if (opts.status === "present") return time ? `P ${time}` : "P";
  if (opts.status === "half_day") return time ? `HD ${time}` : "HD";
  if (opts.status === "leave") {
    const r = shortReason(opts.reason);
    return r ? `L ${r}` : "L";
  }
  const r = shortReason(opts.reason);
  if (time) return r ? `A ${time} ${r}` : `A ${time}`;
  return r ? `A ${r}` : "A";
}

export function dayHeader(ymd: string) {
  return ymd.slice(8, 10);
}
