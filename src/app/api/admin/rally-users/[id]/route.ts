import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/security";
import { rallyUserFields } from "@/lib/rallyUserFields";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = await requireSuperAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = rallyUserFields.partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid user." }, { status: 400 });
  const data = { ...parsed.data };
  if (data.phone) {
    const phone = normalizePhone(data.phone);
    if (!phone) return NextResponse.json({ error: "Invalid mobile number." }, { status: 400 });
    const fieldClash = await prisma.user.findUnique({ where: { phone } });
    if (fieldClash?.isActive) {
      return NextResponse.json(
        {
          error:
            "This number already belongs to an active field attendance user. Remove/deactivate them under Field users, or use a different number.",
        },
        { status: 409 }
      );
    }
    data.phone = phone;
  }
  if (data.pocNumber) data.pocNumber = normalizePhone(data.pocNumber) || data.pocNumber;
  try {
    const user = await prisma.rallyUser.update({ where: { id: params.id }, data });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Could not update user." }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const s = await requireSuperAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.rallyUser.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
