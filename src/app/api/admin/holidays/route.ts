import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DESIGNATIONS, isSuperAdmin } from "@/lib/hierarchy";
import { istDayBounds } from "@/lib/dailyAttendance";

const allowed = new Set<string>(DESIGNATIONS);

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(3).max(200),
  designations: z.array(z.string().trim().min(1)).min(1, "Select at least one designation."),
});

function jsonHoliday(h: { id: string; date: Date; reason: string; designations: string[]; createdBy: string }) {
  return {
    id: h.id,
    date: h.date.toISOString().slice(0, 10),
    reason: h.reason,
    designations: h.designations || [],
    createdBy: h.createdBy,
  };
}

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const year = Number(q.get("year")) || new Date().getFullYear();
  const month = Number(q.get("month")) || new Date().getMonth() + 1;
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  const { dateOnly: start } = istDayBounds(from);
  const { dateOnly: end } = istDayBounds(to);
  const rows = await prisma.holiday.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: "asc" },
  });
  return NextResponse.json({
    designations: [...DESIGNATIONS],
    holidays: rows.map(jsonHoliday),
  });
}

export async function POST(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(s.admin)) return NextResponse.json({ error: "Super admin only." }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message || "Date, reason, and at least one designation required.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  const dens = [...new Set(parsed.data.designations.filter((d) => allowed.has(d)))];
  if (!dens.length) {
    return NextResponse.json({ error: "Select at least one valid designation." }, { status: 400 });
  }
  const { dateOnly } = istDayBounds(parsed.data.date);
  const holiday = await prisma.holiday.upsert({
    where: { date: dateOnly },
    create: {
      date: dateOnly,
      reason: parsed.data.reason,
      designations: dens,
      createdBy: s.admin.email || s.admin.name || s.sub,
    },
    update: { reason: parsed.data.reason, designations: dens },
  });
  return NextResponse.json({ holiday: jsonHoliday(holiday) });
}

export async function DELETE(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(s.admin)) return NextResponse.json({ error: "Super admin only." }, { status: 403 });
  const date = new URL(req.url).searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Date required." }, { status: 400 });
  const { dateOnly } = istDayBounds(date);
  await prisma.holiday.deleteMany({ where: { date: dateOnly } });
  return NextResponse.json({ ok: true });
}
