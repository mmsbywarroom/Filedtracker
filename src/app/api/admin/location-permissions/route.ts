import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reviewScopeWhere } from "@/lib/hierarchy";

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const status = (searchParams.get("status") || "all").toLowerCase();

  const users = await prisma.user.findMany({
    where: {
      ...reviewScopeWhere(s.admin),
      isActive: true,
    },
    orderBy: [{ zone: "asc" }, { district: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      phone: true,
      designation: true,
      assemblyName: true,
      sectorAllotted: true,
      zone: true,
      district: true,
      locationForeground: true,
      locationBackground: true,
      locationPermAt: true,
      locationPermPlatform: true,
    },
  });

  const rows = users
    .map((u) => {
      let alwaysStatus: "always" | "while_using" | "denied" | "unknown" = "unknown";
      if (u.locationPermAt == null && u.locationBackground == null && u.locationForeground == null) {
        alwaysStatus = "unknown";
      } else if (u.locationBackground) {
        alwaysStatus = "always";
      } else if (u.locationForeground) {
        alwaysStatus = "while_using";
      } else {
        alwaysStatus = "denied";
      }
      return {
        id: u.id,
        name: u.name,
        phone: u.phone,
        designation: u.designation,
        assemblyName: u.assemblyName,
        sectorAllotted: u.sectorAllotted,
        zone: u.zone,
        district: u.district,
        foreground: u.locationForeground,
        background: u.locationBackground,
        alwaysStatus,
        platform: u.locationPermPlatform,
        updatedAt: u.locationPermAt?.toISOString() ?? null,
      };
    })
    .filter((r) => {
      if (status === "always" && r.alwaysStatus !== "always") return false;
      if (status === "while_using" && r.alwaysStatus !== "while_using") return false;
      if (status === "denied" && r.alwaysStatus !== "denied") return false;
      if (status === "unknown" && r.alwaysStatus !== "unknown") return false;
      if (status === "not_always" && r.alwaysStatus === "always") return false;
      if (!q) return true;
      const hay = `${r.name} ${r.phone} ${r.designation} ${r.assemblyName} ${r.sectorAllotted} ${r.zone} ${r.district}`.toLowerCase();
      return hay.includes(q);
    });

  const summary = {
    total: rows.length,
    always: rows.filter((r) => r.alwaysStatus === "always").length,
    whileUsing: rows.filter((r) => r.alwaysStatus === "while_using").length,
    denied: rows.filter((r) => r.alwaysStatus === "denied").length,
    unknown: rows.filter((r) => r.alwaysStatus === "unknown").length,
  };

  return NextResponse.json({ users: rows, summary });
}
