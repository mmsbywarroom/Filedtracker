import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/security";
import { rallyUserFields } from "@/lib/rallyUserFields";

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim() || "";
  const rallyId = new URL(req.url).searchParams.get("rallyId") || "";
  const users = await prisma.rallyUser.findMany({
    where: {
      ...(rallyId ? { rallyId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q.replace(/\D/g, "") } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { rally: { select: { id: true, name: true, isActive: true } } },
  });
  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = rallyUserFields.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Fill required user fields." }, { status: 400 });
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return NextResponse.json({ error: "Invalid mobile number." }, { status: 400 });
  const fieldClash = await prisma.user.findUnique({ where: { phone } });
  if (fieldClash) {
    return NextResponse.json({ error: "This number already belongs to a field attendance user." }, { status: 409 });
  }
  try {
    const user = await prisma.rallyUser.create({
      data: { ...parsed.data, phone, pocNumber: parsed.data.pocNumber ? normalizePhone(parsed.data.pocNumber) || parsed.data.pocNumber : "" },
    });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "User with this number already exists." }, { status: 409 });
  }
}

export async function DELETE(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { ids?: string[]; all?: boolean; rallyId?: string } | null;
  if (body?.all) {
    const where = body.rallyId ? { rallyId: body.rallyId } : {};
    const result = await prisma.rallyUser.deleteMany({ where });
    return NextResponse.json({ deleted: result.count });
  }
  const ids = Array.isArray(body?.ids) ? body!.ids.filter((id) => typeof id === "string") : [];
  if (!ids.length) return NextResponse.json({ error: "Select users to delete." }, { status: 400 });
  const result = await prisma.rallyUser.deleteMany({ where: { id: { in: ids } } });
  return NextResponse.json({ deleted: result.count });
}
