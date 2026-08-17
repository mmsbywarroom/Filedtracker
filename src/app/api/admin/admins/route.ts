import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DESIGNATIONS, canManageAdmins, defaultVisibleDesignations } from "@/lib/hierarchy";

const schema = z.object({
  email: z.string().min(3).max(80),
  name: z.string().min(1).max(80),
  password: z.string().min(6).max(80),
  accessLevel: z.enum(["State", "ZLC", "DLC", "Cluster", "ALC"]),
  designations: z.array(z.string()).optional(),
  zone: z.string().optional(),
  district: z.string().optional(),
  assemblyName: z.string().optional(),
  cluster: z.string().optional(),
});

export async function GET() {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageAdmins(s.admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admins = await prisma.admin.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      accessLevel: true,
      isSuper: true,
      designations: true,
      zone: true,
      district: true,
      assemblyName: true,
      cluster: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ admins });
}

export async function POST(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageAdmins(s.admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid admin details." }, { status: 400 });
  const email = parsed.data.email.trim().toLowerCase();
  const designations = (parsed.data.designations || defaultVisibleDesignations(parsed.data.accessLevel)).filter((d) =>
    DESIGNATIONS.includes(d as (typeof DESIGNATIONS)[number])
  );
  try {
    const admin = await prisma.admin.create({
      data: {
        email,
        name: parsed.data.name.trim(),
        passwordHash: await bcrypt.hash(parsed.data.password, 12),
        accessLevel: parsed.data.accessLevel,
        isSuper: false,
        designations,
        zone: parsed.data.zone?.trim() || "",
        district: parsed.data.district?.trim() || "",
        assemblyName: parsed.data.assemblyName?.trim() || "",
        cluster: parsed.data.cluster?.trim() || "",
      },
      select: { id: true, email: true, name: true, accessLevel: true },
    });
    return NextResponse.json({ admin });
  } catch {
    return NextResponse.json({ error: "This admin ID already exists." }, { status: 409 });
  }
}
