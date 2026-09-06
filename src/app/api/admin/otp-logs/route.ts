import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/security";

/** Super-admin OTP request forensic log. */
export async function GET(req: Request) {
  const s = await requireSuperAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const phoneRaw = url.searchParams.get("phone") || "";
  const phone = normalizePhone(phoneRaw) || phoneRaw.replace(/\D/g, "");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const createdAt: { gte?: Date; lte?: Date } = {};
  if (from) createdAt.gte = new Date(`${from}T00:00:00+05:30`);
  if (to) createdAt.lte = new Date(`${to}T23:59:59+05:30`);

  const logs = await prisma.otpRequestLog.findMany({
    where: {
      ...(phone ? { phone: { contains: phone } } : {}),
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const phones = Array.from(new Set(logs.map((l) => l.phone)));
  const users = phones.length
    ? await prisma.user.findMany({
        where: { phone: { in: phones } },
        select: {
          id: true,
          name: true,
          phone: true,
          designation: true,
          zone: true,
          district: true,
          assemblyName: true,
        },
      })
    : [];
  const byPhone = new Map(users.map((u) => [u.phone, u]));

  return NextResponse.json({
    rows: logs.map((l) => {
      const u = byPhone.get(l.phone);
      return {
        ...l,
        employeeId: u?.id || null,
        employeeName: u?.name || null,
        designation: u?.designation || null,
        zone: u?.zone || null,
        district: u?.district || null,
        assemblyName: u?.assemblyName || null,
      };
    }),
  });
}
