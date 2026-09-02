import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { grantGpsBypass, istDayEnd } from "@/lib/gpsAntiSpoof";
import { reviewScopeWhere } from "@/lib/hierarchy";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  userId: z.string().min(1),
  logId: z.string().optional(),
  reason: z.string().trim().min(3, "Reason is required (at least 3 characters).").max(300),
});

export async function POST(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || "Invalid request." }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { AND: [{ id: parsed.data.userId }, reviewScopeWhere(s.admin)] },
    select: { id: true, name: true },
  });
  if (!user) return NextResponse.json({ error: "User not in your scope." }, { status: 404 });

  const adminLabel = (s.admin.name || "").trim() || s.admin.email;
  const bypass = await grantGpsBypass({
    userId: user.id,
    adminId: s.admin.id,
    adminName: adminLabel,
    reason: parsed.data.reason,
    logId: parsed.data.logId,
    expiresAt: istDayEnd(),
  });

  return NextResponse.json({
    ok: true,
    message: `${user.name} can punch again until ${bypass.expiresAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.`,
    bypassUntil: bypass.expiresAt.toISOString(),
  });
}
