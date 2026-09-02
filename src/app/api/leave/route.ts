import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  fromDate: z.string().min(8),
  toDate: z.string().min(8),
  reason: z.string().trim().min(3).max(400),
});

function istDay(isoDate: string) {
  return new Date(`${isoDate}T00:00:00+05:30`);
}

export async function GET(req: Request) {
  const s = await requireUser(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const leaves = await prisma.leaveRequest.findMany({
    where: { userId: s.sub },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ leaves });
}

export async function POST(req: Request) {
  const s = await requireUser(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Select dates and enter a reason (at least 3 letters)." }, { status: 400 });
  }
  const fromDate = istDay(parsed.data.fromDate);
  const toDate = istDay(parsed.data.toDate);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return NextResponse.json({ error: "Invalid dates." }, { status: 400 });
  }
  if (toDate < fromDate) {
    return NextResponse.json({ error: "End date cannot be before start date." }, { status: 400 });
  }

  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      userId: s.sub,
      status: { in: ["pending", "approved"] },
      fromDate: { lte: toDate },
      toDate: { gte: fromDate },
    },
  });
  if (overlap) {
    return NextResponse.json({ error: "You already have a leave request covering these dates." }, { status: 409 });
  }

  const leave = await prisma.leaveRequest.create({
    data: {
      userId: s.sub,
      fromDate,
      toDate,
      reason: parsed.data.reason,
      status: "pending",
    },
  });
  return NextResponse.json({ leave, ok: true });
}
