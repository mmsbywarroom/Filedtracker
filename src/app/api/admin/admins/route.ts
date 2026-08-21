import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DESIGNATIONS,
  canManageAdmins,
  defaultVisibleDesignations,
  parseAssembliesInput,
} from "@/lib/hierarchy";

const schema = z.object({
  email: z.string().min(3).max(80),
  name: z.string().min(1).max(80),
  password: z.string().min(6).max(80),
  accessLevel: z.enum(["State", "Zone Coordinator", "ZLC", "DLC", "Cluster", "ALC"]),
  designations: z.array(z.string()).optional(),
  zone: z.string().optional(),
  district: z.string().optional(),
  assemblyName: z.string().optional(),
  assemblies: z.union([z.array(z.string()), z.string()]).optional(),
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
      assemblies: true,
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
  const accessLevel = parsed.data.accessLevel;
  const zone = parsed.data.zone?.trim() || "";
  const district = parsed.data.district?.trim() || "";
  const cluster = parsed.data.cluster?.trim() || "";
  let assemblies = parseAssembliesInput(parsed.data.assemblies);
  let assemblyName = parsed.data.assemblyName?.trim() || "";

  if (accessLevel !== "State" && !zone) {
    return NextResponse.json({ error: "Zone is required." }, { status: 400 });
  }
  if ((accessLevel === "DLC" || accessLevel === "Cluster" || accessLevel === "ALC") && !district) {
    return NextResponse.json({ error: "District is required." }, { status: 400 });
  }
  if (accessLevel === "Cluster" && !cluster) {
    return NextResponse.json({ error: "Cluster is required." }, { status: 400 });
  }
  if (accessLevel === "DLC" || accessLevel === "Cluster") {
    if (!assemblies.length && assemblyName) assemblies = parseAssembliesInput(assemblyName);
    if (!assemblies.length) {
      return NextResponse.json(
        { error: "Map at least one assembly for DLC / Cluster (pipe-separated in CSV, or multi-select)." },
        { status: 400 }
      );
    }
    assemblyName = assemblies.join("|");
  }
  if (accessLevel === "ALC") {
    if (!assemblyName) return NextResponse.json({ error: "Assembly is required for ALC." }, { status: 400 });
    assemblies = [assemblyName];
  }

  const designations = (parsed.data.designations || defaultVisibleDesignations(accessLevel)).filter((d) =>
    DESIGNATIONS.includes(d as (typeof DESIGNATIONS)[number])
  );
  try {
    const admin = await prisma.admin.create({
      data: {
        email,
        name: parsed.data.name.trim(),
        passwordHash: await bcrypt.hash(parsed.data.password, 12),
        accessLevel,
        isSuper: false,
        designations,
        zone,
        district,
        assemblyName,
        assemblies,
        cluster,
      },
      select: { id: true, email: true, name: true, accessLevel: true, assemblies: true },
    });
    return NextResponse.json({ admin });
  } catch {
    return NextResponse.json({ error: "This admin ID already exists." }, { status: 409 });
  }
}

export async function DELETE(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageAdmins(s.admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === "string" && id.length > 0) : [];
  if (!ids.length) return NextResponse.json({ error: "Select at least one admin." }, { status: 400 });
  if (ids.length > 200) return NextResponse.json({ error: "Too many admins at once (max 200)." }, { status: 400 });

  const result = await prisma.admin.deleteMany({
    where: {
      id: { in: ids },
      isSuper: false,
      NOT: { id: s.admin.id },
    },
  });
  return NextResponse.json({ deleted: result.count, ok: true });
}
