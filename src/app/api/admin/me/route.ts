import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageAdmins, userScopeWhere, visibleDesignationsFor } from "@/lib/hierarchy";

export async function GET() {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    admin: {
      ...s.admin,
      canManageAdmins: canManageAdmins(s.admin),
      visibleDesignations: visibleDesignationsFor(s.admin),
    },
  });
}
