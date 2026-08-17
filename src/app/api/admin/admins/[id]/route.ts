import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DESIGNATIONS, canManageAdmins } from "@/lib/hierarchy";

const schema = z.object({
  name: z.string().min(1).max(80).optional(),
  password: z.string().min(6).max(80).optional(),
  accessLevel: z.enum(["State", "ZLC", "DLC", "Cluster", "ALC"]).optional(),
  designations: z.array(z.string()).optional(),
  zone: z.string().optional(),
  district: z.string().optional(),
  assemblyName: z.string().optional(),
  cluster: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageAdmins(s.admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid details." }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (parsed.data.name) data.name = parsed.data.name.trim();
  if (parsed.data.accessLevel) data.accessLevel = parsed.data.accessLevel;
  if (parsed.data.designations) {
    data.designations = parsed.data.designations.filter((d) => DESIGNATIONS.includes(d as (typeof DESIGNATIONS)[number]));
  }
  if (parsed.data.zone != null) data.zone = parsed.data.zone.trim();
  if (parsed.data.district != null) data.district = parsed.data.district.trim();
  if (parsed.data.assemblyName != null) data.assemblyName = parsed.data.assemblyName.trim();
  if (parsed.data.cluster != null) data.cluster = parsed.data.cluster.trim();
  if (parsed.data.password) data.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const admin = await prisma.admin.update({
    where: { id: params.id },
    data,
    select: { id: true, email: true, name: true, accessLevel: true },
  });
  return NextResponse.json({ admin });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageAdmins(s.admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (params.id === s.admin.id) return NextResponse.json({ error: "Cannot delete your own login." }, { status: 400 });
  const target = await prisma.admin.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.isSuper) return NextResponse.json({ error: "Cannot delete super admin." }, { status: 400 });
  await prisma.admin.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
