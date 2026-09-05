import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { istDateString, istDayBounds } from "@/lib/dailyAttendance";
import { rallyDateYmd } from "@/lib/rallies";

const schema = z.object({
  name: z.string().min(2).max(120),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isActive: z.boolean().optional(),
});

function jsonRally(r: {
  id: string;
  name: string;
  lat: number;
  lng: number;
  scheduledDate: Date;
  isActive: boolean;
  _count?: { users: number };
}) {
  return {
    id: r.id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    scheduledDate: rallyDateYmd(r.scheduledDate),
    isActive: r.isActive,
    userCount: r._count?.users ?? 0,
  };
}

export async function GET() {
  const s = await requireSuperAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rallies = await prisma.rally.findMany({
    orderBy: [{ scheduledDate: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { users: true } } },
  });
  return NextResponse.json({ rallies: rallies.map(jsonRally) });
}

export async function POST(req: Request) {
  const s = await requireSuperAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Venue name, date, lat and lng required." }, { status: 400 });
  }
  const ymd = body.data.scheduledDate;
  const { dateOnly } = istDayBounds(ymd);
  const isToday = ymd === istDateString();
  const makeActive = body.data.isActive !== false && isToday;
  // Same day can have multiple rallies at different venues — do not deactivate others.
  const rally = await prisma.rally.create({
    data: {
      name: body.data.name,
      lat: body.data.lat,
      lng: body.data.lng,
      scheduledDate: dateOnly,
      isActive: makeActive,
    },
  });
  return NextResponse.json({ rally: jsonRally({ ...rally, _count: { users: 0 } }) });
}
