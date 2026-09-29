import { NextResponse } from "next/server";
import { getCallAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const s = await getCallAdminSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const users = await prisma.user.findMany({
    where: { designation: "Call Center" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      phone: true,
      designation: true,
      assemblyName: true,
      sectorAllotted: true,
      zone: true,
      district: true,
      isActive: true,
    },
  });
  return NextResponse.json({ users });
}
