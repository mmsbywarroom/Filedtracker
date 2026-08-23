import { NextResponse } from "next/server";
import { getUserSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const s = await getUserSession();
    if (!s) return NextResponse.json({ user: null });
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
      },
    });
    return NextResponse.json({ user: user ? { ...user, role: "user" } : null });
  } catch (e) {
    console.error("api/me", e);
    return NextResponse.json(
      { user: null, error: "Server temporarily unavailable. Try again shortly." },
      { status: 503 }
    );
  }
}
