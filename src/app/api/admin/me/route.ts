import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { canManageAdmins, canSeeCallCenterUsers, isSuperAdmin, visibleDesignationsFor } from "@/lib/hierarchy";

export async function GET() {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    admin: {
      ...s.admin,
      isSuper: isSuperAdmin(s.admin),
      canSeeCallCenter: canSeeCallCenterUsers(s.admin),
      canManageAdmins: canManageAdmins(s.admin),
      visibleDesignations: visibleDesignationsFor(s.admin),
    },
  });
}
