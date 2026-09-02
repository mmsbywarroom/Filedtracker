import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeUser, userScopeWhere } from "@/lib/hierarchy";
import {
  PRESENT_MIN_HOURS,
  hoursWorkedOnDay,
  istDayBounds,
  istDateString,
  resolveDayAttendanceStatus,
  statusLabel,
} from "@/lib/dailyAttendance";
import { adminPresentLabel, adminPresentRemark, ensureAdminPresentPunch, removeAdminPresentPunch, closeOpenPunchForAdminLeave } from "@/lib/adminPresentPunch";
import { holidayAppliesTo, holidayLeaveReason } from "@/lib/holidays";
import { userPinnedFlagFromSessions } from "@/lib/attendanceIntervalFlag";

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || istDateString();
  const statusFilter = searchParams.get("status") || "";
  const zoneFilter = (searchParams.get("zone") || "").trim();
  const districtFilter = (searchParams.get("district") || "").trim();
  const assemblyFilter = (searchParams.get("assembly") || "").trim();
  const designationFilter = (searchParams.get("designation") || "").trim();
  const sectorFilter = (searchParams.get("sector") || "").trim().toLowerCase();
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const { start, end, dateOnly } = istDayBounds(date);
  const asOf = date === istDateString() ? new Date() : end;

  const users = await prisma.user.findMany({
    where: userScopeWhere(s.admin),
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
    },
  });

  const ids = users.map((u) => u.id);
  if (!ids.length) {
    return NextResponse.json({
      date,
      rows: [],
      summary: { present: 0, halfDay: 0, absent: 0, leave: 0, pending: 0, flagged: 0, total: 0 },
    });
  }

  const [punches, leaves, marks, holiday] = await Promise.all([
    prisma.attendance.findMany({
      where: { userId: { in: ids }, punchInAt: { gte: start, lte: end } },
      select: { id: true, userId: true, punchInAt: true, punchOutAt: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        userId: { in: ids },
        status: "approved",
        fromDate: { lte: end },
        toDate: { gte: start },
      },
      select: { userId: true },
    }),
    prisma.dailyAttendanceMark.findMany({
      where: { userId: { in: ids }, date: dateOnly },
    }),
    prisma.holiday.findUnique({ where: { date: dateOnly } }),
  ]);

  const attendanceIds = punches.map((p) => p.id);
  const snaps = attendanceIds.length
    ? await prisma.attendanceIntervalSnapshot.findMany({
        where: { attendanceId: { in: attendanceIds } },
        select: { attendanceId: true, lat: true, lng: true },
      })
    : [];

  const snapsByAttendance = new Map<string, { lat: number; lng: number }[]>();
  for (const snap of snaps) {
    const list = snapsByAttendance.get(snap.attendanceId) || [];
    list.push({ lat: snap.lat, lng: snap.lng });
    snapsByAttendance.set(snap.attendanceId, list);
  }

  const punchesByUser = new Map<string, { id: string; punchInAt: Date; punchOutAt: Date | null }[]>();
  for (const p of punches) {
    const list = punchesByUser.get(p.userId) || [];
    list.push({ id: p.id, punchInAt: p.punchInAt, punchOutAt: p.punchOutAt });
    punchesByUser.set(p.userId, list);
  }
  const onLeave = new Set(leaves.map((l) => l.userId));
  const markByUser = new Map(marks.map((m) => [m.userId, m]));

  let present = 0;
  let halfDay = 0;
  let absent = 0;
  let leave = 0;
  let pending = 0;
  let flagged = 0;

  const allRows = users
    .filter((u) => canSeeUser(s.admin, u))
    .map((u) => {
      const sessions = punchesByUser.get(u.id) || [];
      const manual = markByUser.get(u.id);
      const resolved = resolveDayAttendanceStatus({
        sessions: sessions.map((x) => ({ punchInAt: x.punchInAt, punchOutAt: x.punchOutAt })),
        asOf,
        dateYmd: date,
        onApprovedLeave: onLeave.has(u.id),
        isHoliday: holidayAppliesTo(holiday, u.designation),
        holidayReason: holidayAppliesTo(holiday, u.designation)
          ? holidayLeaveReason(holiday!.reason, u.designation)
          : null,
        manual: manual
          ? { status: manual.status, source: manual.source, note: manual.note }
          : null,
      });
      const { status, source, reason, hours, firstIn, sessionCount } = resolved;

      const pinFlag = userPinnedFlagFromSessions(
        sessions.map((sess) => ({
          snapshots: snapsByAttendance.get(sess.id) || [],
        }))
      );

      const lastOut = sessions.length
        ? sessions
            .map((x) => x.punchOutAt)
            .filter(Boolean)
            .sort((a, b) => (b!.getTime() - a!.getTime()))[0] || null
        : null;

      return {
        userId: u.id,
        name: u.name,
        phone: u.phone,
        designation: u.designation,
        assemblyName: u.assemblyName,
        sectorAllotted: u.sectorAllotted,
        zone: u.zone,
        district: u.district,
        status,
        statusLabel: statusLabel(status),
        source,
        reason,
        hoursWorked: Math.round(hours * 10) / 10,
        sessionCount,
        punchInAt: firstIn,
        punchOutAt: lastOut,
        markId: manual?.id || null,
        flagged: pinFlag.flagged,
        flagReason: pinFlag.reason,
        flagSameCount: pinFlag.sameCount,
      };
    });

  const rows = allRows.filter((r) => {
    if (zoneFilter && r.zone !== zoneFilter) return false;
    if (districtFilter && r.district !== districtFilter) return false;
    if (assemblyFilter && r.assemblyName !== assemblyFilter) return false;
    if (designationFilter && r.designation !== designationFilter) return false;
    if (sectorFilter && !(r.sectorAllotted || "").toLowerCase().includes(sectorFilter)) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (q) {
      const text = [r.name, r.phone, r.assemblyName, r.designation, r.zone, r.district, r.sectorAllotted]
        .join(" ")
        .toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  for (const r of rows) {
    if (r.status === "present") present += 1;
    else if (r.status === "half_day") halfDay += 1;
    else if (r.status === "leave") leave += 1;
    else if (r.status === "pending") pending += 1;
    else absent += 1;
    if (r.flagged) flagged += 1;
  }

  return NextResponse.json({
    date,
    rows,
    summary: { present, halfDay, absent, leave, pending, flagged, total: rows.length },
    rules: {
      present: `Punch in by 10:30 AM and stay on duty 6–12 hours`,
      halfDay: `Punch in after 10:30 AM and by 1:00 PM`,
      absent: `After 1:00 PM: no punch-in, punch after 1:00 PM, or early punch with under ${PRESENT_MIN_HOURS}h`,
      leave: "Approved leave, holiday calendar (selected designations), or marked leave on Attendance",
    },
  });
}

const patchSchema = z.object({
  userId: z.string().min(1),
  date: z.string().min(8),
  status: z.enum(["present", "half_day", "absent", "leave"]),
  note: z.string().trim().min(3, "Reason is required (at least 3 characters).").max(200),
});

export async function PATCH(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message || "Invalid request.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { userId, date, status, note } = parsed.data;
  const { dateOnly, start, end } = istDayBounds(date);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      designation: true,
      zone: true,
      district: true,
      assemblyName: true,
      cluster: true,
    },
  });
  if (!user || !canSeeUser(s.admin, user)) {
    return NextResponse.json({ error: "User not in your scope." }, { status: 403 });
  }

  const sessions = await prisma.attendance.findMany({
    where: { userId, punchInAt: { gte: start, lte: end } },
    select: { punchInAt: true, punchOutAt: true },
  });
  const hours = hoursWorkedOnDay(sessions, date === istDateString() ? new Date() : end);
  const adminLabel = adminPresentLabel(s.admin.name, s.admin.email);
  const storedNote =
    status === "present" ? `${adminPresentRemark(adminLabel)}. ${note}` : note;

  if (status === "present") {
    await ensureAdminPresentPunch({
      userId,
      dateYmd: date,
      start,
      end,
      adminLabel,
      note,
    });
  } else if (status === "leave") {
    await removeAdminPresentPunch({ userId, start, end });
    await closeOpenPunchForAdminLeave({
      userId,
      start,
      end,
      adminLabel,
      note,
    });
  } else {
    await removeAdminPresentPunch({ userId, start, end });
  }

  const mark = await prisma.dailyAttendanceMark.upsert({
    where: { userId_date: { userId, date: dateOnly } },
    create: {
      userId,
      date: dateOnly,
      status,
      source: "manual",
      hoursWorked: hours,
      note: storedNote,
      markedBy: s.admin.id,
    },
    update: {
      status,
      source: "manual",
      hoursWorked: hours,
      note: storedNote,
      markedBy: s.admin.id,
    },
  });

  return NextResponse.json({ ok: true, mark });
}
