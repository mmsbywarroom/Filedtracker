import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ user: null });
  if (s.role === "admin") {
    return NextResponse.json({ user: { role: "admin", name: "Admin" } });
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
    },
  });
  return NextResponse.json({ user: user ? { ...user, role: "user" } : null });
}
