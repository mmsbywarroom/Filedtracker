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

  // Live resolve device owners for older rows / missing fields via install ID.
  const installIds = Array.from(
    new Set(logs.map((l) => l.appInstallationId).filter((id) => Boolean(id)))
  );
  const installs = installIds.length
    ? await prisma.deviceAppInstallation.findMany({
        where: { appInstallationId: { in: installIds } },
        orderBy: { lastSeenAt: "desc" },
      })
    : [];
  const installOwnerId = new Map<string, string>();
  for (const i of installs) {
    if (!installOwnerId.has(i.appInstallationId)) {
      installOwnerId.set(i.appInstallationId, i.userId);
    }
  }
  const ownerIds = Array.from(
    new Set([
      ...logs.map((l) => l.deviceOwnerUserId).filter(Boolean),
      ...Array.from(installOwnerId.values()),
    ])
  );
  const owners = ownerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: ownerIds } },
        select: { id: true, name: true, phone: true },
      })
    : [];
  const byOwnerId = new Map(owners.map((u) => [u.id, u]));

  return NextResponse.json({
    rows: logs.map((l) => {
      const u = byPhone.get(l.phone);
      const liveOwnerId =
        l.deviceOwnerUserId || (l.appInstallationId ? installOwnerId.get(l.appInstallationId) || "" : "");
      const liveOwner = liveOwnerId ? byOwnerId.get(liveOwnerId) : null;
      const deviceOwnerName = l.deviceOwnerName || liveOwner?.name || "";
      const deviceOwnerPhone = l.deviceOwnerPhone || liveOwner?.phone || "";
      const deviceOwnerUserId = liveOwnerId || "";
      const mismatch = Boolean(
        u && deviceOwnerUserId && deviceOwnerUserId !== u.id
      );
      return {
        ...l,
        employeeId: u?.id || null,
        employeeName: u?.name || null,
        designation: u?.designation || null,
        zone: u?.zone || null,
        district: u?.district || null,
        assemblyName: u?.assemblyName || null,
        deviceOwnerUserId,
        deviceOwnerName,
        deviceOwnerPhone,
        deviceOwnerMismatch: mismatch,
      };
    }),
  });
}
