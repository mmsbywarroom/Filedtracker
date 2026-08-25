import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeUser } from "@/lib/hierarchy";
import { istDateString, istDayBounds } from "@/lib/dailyAttendance";

const schema = z.object({
  userId: z.string().min(1),
  date: z.string().min(8),
  remark: z.string().trim().min(3, "Remark is required (at least 3 characters).").max(200),
});

function punchAtForDate(dateYmd: string) {
  const today = istDateString();
  if (dateYmd === today) return new Date();
  return new Date(`${dateYmd}T10:00:00+05:30`);
}

export async function POST(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || "Invalid request." }, { status: 400 });
  }

  const { userId, date, remark } = parsed.data;
  const { start, end, dateOnly } = istDayBounds(date);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      isActive: true,
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
  if (!user.isActive) {
    return NextResponse.json({ error: "Inactive users cannot be marked present." }, { status: 400 });
  }

  const existing = await prisma.attendance.findFirst({
    where: { userId, punchInAt: { gte: start, lte: end } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "User already punched in on this date." }, { status: 400 });
  }

  const adminLabel = (s.admin.name || "").trim() || s.admin.email;
  const when = punchAtForDate(date);
  const address = `Manually marked present by admin · ${adminLabel}`;
  const note = remark.trim();

  const [attendance] = await prisma.$transaction([
    prisma.attendance.create({
      data: {
        userId,
        punchInAt: when,
        punchOutAt: when,
        punchInLat: 0,
        punchInLng: 0,
        punchOutLat: 0,
        punchOutLng: 0,
        punchInAddress: address,
        punchOutAddress: note,
        punchOutReason: "admin_present",
      },
      select: { id: true, punchInAt: true },
    }),
    prisma.dailyAttendanceMark.upsert({
      where: { userId_date: { userId, date: dateOnly } },
      create: {
        userId,
        date: dateOnly,
        status: "present",
        source: "manual",
        hoursWorked: 0,
        note: `${note} · Marked by ${adminLabel}`,
        markedBy: s.admin.id,
      },
      update: {
        status: "present",
        source: "manual",
        note: `${note} · Marked by ${adminLabel}`,
        markedBy: s.admin.id,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    attendance,
    message: `${user.name} marked present by admin.`,
  });
}
