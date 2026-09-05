import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { parseClientSource } from "@/lib/clientSource";
import { createPunchChallenge } from "@/lib/locationIntegrity/challenge";

/** Native-only: issue punchId + challenge for silent integrity binding. Never blocks punch. */
export async function POST(req: Request) {
  const s = await requireUser(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (parseClientSource(req) !== "native") {
    return NextResponse.json({ ok: true, skipped: "web" });
  }

  const body = await req.json().catch(() => null);
  const punchType = body?.punchType === "punch_out" ? "punch_out" : "punch_in";
  const attendanceId = typeof body?.attendanceId === "string" ? body.attendanceId : null;

  const challenge = await createPunchChallenge({
    userId: s.sub,
    punchType,
    attendanceId,
  });

  return NextResponse.json({
    ok: true,
    ...challenge,
  });
}
