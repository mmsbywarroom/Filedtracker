import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeUser, userScopeWhere } from "@/lib/hierarchy";
import {
  istDateString,
  istDayBounds,
  resolveDayAttendanceStatus,
} from "@/lib/dailyAttendance";
import { holidayAppliesTo, holidayLeaveReason } from "@/lib/holidays";
import { monthDayList, salaryCell } from "@/lib/salaryRegister";

export async function GET(req: Request) {
  const s = await requireSuperAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams;
  const now = new Date();
  const year = Number(q.get("year")) || now.getFullYear();
  const month = Number(q.get("month")) || now.getMonth() + 1;
  if (month < 1 || month > 12 || year < 2020 || year > 2100) {
    return NextResponse.json({ error: "Invalid month." }, { status: 400 });
  }
  const designation = (q.get("designation") || "").trim();
  const zone = (q.get("zone") || "").trim();
  const district = (q.get("district") || "").trim();

  const days = monthDayList(year, month);
  const from = days[0];
  const to = days[days.length - 1];
  const { start } = istDayBounds(from);
  const { end } = istDayBounds(to);
  const { dateOnly: fromDate } = istDayBounds(from);
  const { dateOnly: toDate } = istDayBounds(to);
  const todayYmd = istDateString();

  const users = (await prisma.user.findMany({
    where: {
      AND: [
        userScopeWhere(s.admin),
        designation ? { designation } : {},
        zone ? { zone } : {},
        district ? { district } : {},
      ],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      phone: true,
      designation: true,
      assemblyName: true,
      zone: true,
      district: true,
    },
  })).filter((u) => canSeeUser(s.admin, u));

  const ids = users.map((u) => u.id);
  if (!ids.length) {
    return NextResponse.json({ year, month, days, rows: [] });
  }

  const [punches, leaves, marks, holidays] = await Promise.all([
    prisma.attendance.findMany({
      where: { userId: { in: ids }, punchInAt: { gte: start, lte: end } },
      select: { userId: true, punchInAt: true, punchOutAt: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        userId: { in: ids },
        status: "approved",
        fromDate: { lte: end },
        toDate: { gte: start },
      },
      select: { userId: true, fromDate: true, toDate: true },
    }),
    prisma.dailyAttendanceMark.findMany({
      where: { userId: { in: ids }, date: { gte: fromDate, lte: toDate } },
      select: { userId: true, date: true, status: true, source: true, note: true },
    }),
    prisma.holiday.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
    }),
  ]);

  const punchesByUserDay = new Map<string, { punchInAt: Date; punchOutAt: Date | null }[]>();
  for (const p of punches) {
    const day = p.punchInAt.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const key = `${p.userId}|${day}`;
    const list = punchesByUserDay.get(key) || [];
    list.push({ punchInAt: p.punchInAt, punchOutAt: p.punchOutAt });
    punchesByUserDay.set(key, list);
  }

  const markByUserDay = new Map(
    marks.map((m) => [`${m.userId}|${m.date.toISOString().slice(0, 10)}`, m] as const)
  );
  const holidayByDay = new Map(holidays.map((h) => [h.date.toISOString().slice(0, 10), h] as const));
  const leavesByUser = new Map<string, { fromDate: Date; toDate: Date }[]>();
  for (const l of leaves) {
    const list = leavesByUser.get(l.userId) || [];
    list.push({ fromDate: l.fromDate, toDate: l.toDate });
    leavesByUser.set(l.userId, list);
  }

  const rows = users.map((u) => {
    const cells: Record<string, string> = {};
    let present = 0;
    let halfDay = 0;
    let absent = 0;
    let leave = 0;
    for (const dateYmd of days) {
      if (dateYmd > todayYmd) {
        cells[dateYmd] = "";
        continue;
      }
      const { end: dayEnd } = istDayBounds(dateYmd);
      const asOf = dateYmd === todayYmd ? new Date() : dayEnd;
      const holiday = holidayByDay.get(dateYmd) || null;
      const onHoliday = holidayAppliesTo(holiday, u.designation);
      const dayLeaves = leavesByUser.get(u.id) || [];
      const onApprovedLeave = dayLeaves.some((l) => l.fromDate <= dayEnd && l.toDate >= istDayBounds(dateYmd).start);
      const mark = markByUserDay.get(`${u.id}|${dateYmd}`);
      const resolved = resolveDayAttendanceStatus({
        sessions: punchesByUserDay.get(`${u.id}|${dateYmd}`) || [],
        asOf,
        dateYmd,
        onApprovedLeave,
        isHoliday: onHoliday,
        holidayReason: onHoliday && holiday ? holidayLeaveReason(holiday.reason, u.designation) : null,
        manual: mark ? { status: mark.status, source: mark.source, note: mark.note } : null,
      });
      cells[dateYmd] = salaryCell({
        status: resolved.status,
        firstIn: resolved.firstIn,
        reason: resolved.reason,
        dateYmd,
        todayYmd,
      });
      if (resolved.status === "present") present += 1;
      else if (resolved.status === "half_day") halfDay += 1;
      else if (resolved.status === "leave") leave += 1;
      else if (resolved.status === "absent") absent += 1;
    }
    return {
      userId: u.id,
      name: u.name,
      phone: u.phone,
      designation: u.designation,
      zone: u.zone,
      district: u.district,
      assemblyName: u.assemblyName,
      cells,
      present,
      halfDay,
      absent,
      leave,
    };
  });

  return NextResponse.json({ year, month, days, todayYmd, rows });
}
