import { NextResponse } from "next/server";
import { getCallAdminSession } from "@/lib/auth";
import { loadCallOfficeSummary } from "@/lib/callOfficeSummary";

export async function GET() {
  const s = await getCallAdminSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sites = await loadCallOfficeSummary();
  return NextResponse.json({ sites });
}
