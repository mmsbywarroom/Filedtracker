import { NextResponse } from "next/server";
import { getUserSessionFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const s = await getUserSessionFromRequest(req);
    if (!s) return NextResponse.json({ user: null });
    if (s.kind === "rally") {
      const rallyUser = await prisma.rallyUser.findUnique({
        where: { id: s.sub },
        select: { id: true, name: true, phone: true, zone: true, district: true, acName: true, vehicleNo: true },
      });
      return NextResponse.json({
        user: rallyUser ? { ...rallyUser, role: "user", kind: "rally" } : null,
      });
    }
    const user = await prisma.user.findUnique({
      where: { id: s.sub },
      select: {
        id: true,
        name: true,
        phone: true,
        assemblyName: true,
        sectorAllotted: true,
        zone: true,
        district: true,
        faceRegisteredAt: true,
        usesTurban: true,
      },
    });
    return NextResponse.json({ user: user ? { ...user, role: "user", kind: "field" } : null });
  } catch (e) {
    console.error("api/me", e);
    return NextResponse.json(
      { user: null, error: "Server temporarily unavailable. Try again shortly." },
      { status: 503 }
    );
  }
}
