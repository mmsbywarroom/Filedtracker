import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeUser, userScopeWhere } from "@/lib/hierarchy";
import {
  ATTENDANCE_STATUSES,
  ABSENT_MAX_HOURS,
  PRESENT_MIN_HOURS,
  PRESENT_MAX_HOURS,
  autoAttendanceStatus,
  autoReason,
  hoursWorkedOnDay,
  istDayBounds,
  istDateString,
  statusLabel,
} from "@/lib/dailyAttendance";
import { adminPresentLabel, adminPresentRemark, ensureAdminPresentPunch, removeAdminPresentPunch } from "@/lib/adminPresentPunch";

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || istDateString();
  const statusFilter = searchParams.get("status") || "";
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
    return NextResponse.json({ date, rows: [], summary: { present: 0, absent: 0, leave: 0 } });
  }

  const [punches, leaves, marks] = await Promise.all([
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
      select: { userId: true },
    }),
    prisma.dailyAttendanceMark.findMany({
      where: { userId: { in: ids }, date: dateOnly },
    }),
  ]);

  const punchesByUser = new Map<string, { punchInAt: Date; punchOutAt: Date | null }[]>();
  for (const p of punches) {
    const list = punchesByUser.get(p.userId) || [];
    list.push({ punchInAt: p.punchInAt, punchOutAt: p.punchOutAt });
    punchesByUser.set(p.userId, list);
  }
  const onLeave = new Set(leaves.map((l) => l.userId));
  const markByUser = new Map(marks.map((m) => [m.userId, m]));

  let present = 0;
  let absent = 0;
  let leave = 0;

  const allRows = users
    .filter((u) => canSeeUser(s.admin, u))
    .map((u) => {
      const sessions = punchesByUser.get(u.id) || [];
      const hours = hoursWorkedOnDay(sessions, asOf);
      const hadPunch = sessions.length > 0;
      const onLeaveToday = onLeave.has(u.id);
      const manual = markByUser.get(u.id);

      let status: (typeof ATTENDANCE_STATUSES)[number];
      let source: "auto" | "manual";
      let reason: string;

      if (manual?.source === "manual") {
        status = manual.status as (typeof ATTENDANCE_STATUSES)[number];
        source = "manual";
        reason = manual.note || "Marked manually by admin";
      } else if (onLeaveToday) {
        status = "leave";
        source = "auto";
        reason = autoReason("leave", hours, hadPunch, true);
      } else {
        status = autoAttendanceStatus(hours, hadPunch);
        source = "auto";
        reason = autoReason(status, hours, hadPunch, false);
      }

      if (status === "present") present += 1;
      else if (status === "leave") leave += 1;
      else absent += 1;

      const firstIn = sessions.length ? sessions.reduce((a, b) => (a.punchInAt < b.punchInAt ? a : b)).punchInAt : null;
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
        punchInAt: firstIn,
        punchOutAt: lastOut,
        markId: manual?.id || null,
      };
    });

  const rows = allRows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (q) {
        const text = [r.name, r.phone, r.assemblyName, r.designation, r.zone, r.district].join(" ").toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

  return NextResponse.json({
    date,
    rows,
    summary: { present, absent, leave, total: allRows.length },
    rules: {
      absent: `No punch-in, or ≤ ${ABSENT_MAX_HOURS} hours punched`,
      present: `${PRESENT_MIN_HOURS}–${PRESENT_MAX_HOURS} hours punched (or > ${PRESENT_MAX_HOURS}h)`,
      leave: "Approved leave on this date",
    },
  });
}

const patchSchema = z.object({
  userId: z.string().min(1),
  date: z.string().min(8),
  status: z.enum(["present", "absent", "leave"]),
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
