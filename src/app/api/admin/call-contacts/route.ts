import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userScopeWhere } from "@/lib/hierarchy";

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim() || "";
  const digits = q.replace(/\D/g, "");
  const contacts = await prisma.callContact.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { vehicleNumber: { contains: q, mode: "insensitive" } },
            { zone: { contains: q, mode: "insensitive" } },
            { district: { contains: q, mode: "insensitive" } },
            { halka: { contains: q, mode: "insensitive" } },
            { villageWard: { contains: q, mode: "insensitive" } },
            { block: { contains: q, mode: "insensitive" } },
            { position: { contains: q, mode: "insensitive" } },
            { assigneePhone: { contains: digits || q } },
            ...(digits ? [{ phone: { contains: digits } }] : []),
          ],
        }
      : {},
    orderBy: { name: "asc" },
    take: 2000,
    include: { _count: { select: { assignments: true } } },
  });
  const users = await prisma.user.findMany({
    where: { AND: [userScopeWhere(s.admin), { isActive: true }] },
    select: { id: true, name: true, phone: true, designation: true, assemblyName: true },
    orderBy: { name: "asc" },
    take: 2000,
  });
  return NextResponse.json({
    contacts: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      vehicleNumber: c.vehicleNumber,
      zone: c.zone,
      district: c.district,
      halka: c.halka,
      villageWard: c.villageWard,
      block: c.block,
      age: c.age,
      gender: c.gender,
      education: c.education,
      position: c.position,
      fatherName: c.fatherName,
      assigneePhone: c.assigneePhone,
      assignedUsers: c.assigneePhone || c._count.assignments,
    })),
    users,
  });
}

export async function DELETE(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  if (url.searchParams.get("all") === "1") {
    const deleted = await prisma.callContact.deleteMany();
    return NextResponse.json({ ok: true, deleted: deleted.count });
  }
  const id = url.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Contact id required." }, { status: 400 });
  await prisma.callContact.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
