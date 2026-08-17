import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/security";
import { DESIGNATIONS, userScopeWhere } from "@/lib/hierarchy";

const userSchema = z.object({
  name: z.string().min(2).max(80),
  phone: z.string(),
  designation: z.string().optional(),
  assemblyName: z.string().min(1).max(80),
  sectorAllotted: z.string().min(1).max(80),
  zone: z.string().min(1).max(80),
  district: z.string().min(1).max(80),
  cluster: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const users = await prisma.user.findMany({
    where: userScopeWhere(s.admin),
    orderBy: { createdAt: "desc" },
    include: {
      attendances: {
        orderBy: { punchInAt: "desc" },
        take: 1,
        select: { punchInAt: true, punchOutAt: true },
      },
    },
  });
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      designation: u.designation,
      assemblyName: u.assemblyName,
      sectorAllotted: u.sectorAllotted,
      zone: u.zone,
      district: u.district,
      cluster: u.cluster,
      isActive: u.isActive,
      faceRegistered: Boolean(u.faceRegisteredAt),
      faceImage: u.faceImage,
      lastPunchIn: u.attendances[0]?.punchInAt ?? null,
      lastPunchOut: u.attendances[0]?.punchOutAt ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = userSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid details." }, { status: 400 });
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return NextResponse.json({ error: "Invalid mobile number." }, { status: 400 });
  const designation = DESIGNATIONS.includes(parsed.data.designation as (typeof DESIGNATIONS)[number])
    ? parsed.data.designation!
    : "Sector Incharge";
  try {
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        phone,
        designation,
        assemblyName: parsed.data.assemblyName,
        sectorAllotted: parsed.data.sectorAllotted,
        zone: parsed.data.zone,
        district: parsed.data.district,
        cluster: parsed.data.cluster?.trim() || "",
        isActive: parsed.data.isActive ?? true,
      },
    });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "This mobile number already exists." }, { status: 409 });
  }
}
