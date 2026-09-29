import { NextResponse } from "next/server";
import { getCallAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  istDateString,
  istDayBounds,
  resolveDayAttendanceStatus,
  statusLabel,
} from "@/lib/dailyAttendance";
import { holidayAppliesTo, holidayLeaveReason } from "@/lib/holidays";
import { isUnrestrictedPunchPhone } from "@/lib/punchInWindow";
import { isAttendanceEligibleOnDay } from "@/lib/userActiveOnDay";

export async function GET(req: Request) {
  const s = await getCallAdminSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const date = new URL(req.url).searchParams.get("date") || istDateString();
  const { start, end, dateOnly } = istDayBounds(date);
  const asOf = date === istDateString() ? new Date() : end;

  const users = await prisma.user.findMany({
    where: { designation: "Call Center" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      phone: true,
      designation: true,
      assemblyName: true,
      sectorAllotted: true,
      zone: true,
      district: true,
      isActive: true,
      deactivatedAt: true,
    },
  });
  const ids = users.map((u) => u.id);
  const [punches, leaves, marks, holiday] = await Promise.all([
    ids.length
      ? prisma.attendance.findMany({
          where: { userId: { in: ids }, punchInAt: { gte: start, lte: end } },
          select: { userId: true, punchInAt: true, punchOutAt: true },
        })
      : Promise.resolve([]),
    ids.length
      ? prisma.leaveRequest.findMany({
          where: { userId: { in: ids }, status: "approved", fromDate: { lte: end }, toDate: { gte: start } },
          select: { userId: true },
        })
      : Promise.resolve([]),
    ids.length ? prisma.dailyAttendanceMark.findMany({ where: { userId: { in: ids }, date: dateOnly } }) : Promise.resolve([]),
    prisma.holiday.findUnique({ where: { date: dateOnly } }),
  ]);

  const punchesByUser = new Map<string, { punchInAt: Date; punchOutAt: Date | null }[]>();
  for (const p of punches) {
    const list = punchesByUser.get(p.userId) || [];
    list.push(p);
    punchesByUser.set(p.userId, list);
  }
  const onLeave = new Set(leaves.map((l) => l.userId));
  const markByUser = new Map(marks.map((m) => [m.userId, m]));

  const rows = users
    .filter((u) => isAttendanceEligibleOnDay({ isActive: u.isActive, deactivatedAt: u.deactivatedAt, dateYmd: date }))
    .map((u) => {
      const sessions = punchesByUser.get(u.id) || [];
      const manual = markByUser.get(u.id);
      const resolved = resolveDayAttendanceStatus({
        sessions,
        asOf,
        dateYmd: date,
        onApprovedLeave: onLeave.has(u.id),
        isHoliday: holidayAppliesTo(holiday, u.designation),
        holidayReason: holidayAppliesTo(holiday, u.designation) ? holidayLeaveReason(holiday!.reason, u.designation) : null,
        manual: manual ? { status: manual.status, source: manual.source, note: manual.note } : null,
        allowBeforeEarliest: isUnrestrictedPunchPhone(u.phone),
      });
      const lastOut = sessions
        .map((x) => x.punchOutAt)
        .filter((x): x is Date => Boolean(x))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      return {
        userId: u.id,
        name: u.name,
        phone: u.phone,
        assemblyName: u.assemblyName,
        sectorAllotted: u.sectorAllotted,
        zone: u.zone,
        district: u.district,
        status: resolved.status,
        statusLabel: statusLabel(resolved.status),
        hoursWorked: Math.round(resolved.hours * 10) / 10,
        punchInAt: resolved.firstIn,
        punchOutAt: lastOut || null,
      };
    });

  const summary = {
    total: rows.length,
    present: rows.filter((r) => r.status === "present").length,
    halfDay: rows.filter((r) => r.status === "half_day").length,
    absent: rows.filter((r) => r.status === "absent").length,
    leave: rows.filter((r) => r.status === "leave").length,
    pending: rows.filter((r) => r.status === "pending" || r.status === "in_progress").length,
  };
  return NextResponse.json({ date, rows, summary });
}
