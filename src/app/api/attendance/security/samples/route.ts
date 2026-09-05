import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { parseClientSource } from "@/lib/clientSource";
import { ingestLocationSamples } from "@/lib/locationIntegrity/ingestSamples";

/** Native silent location sample upload. Never affects punch success. */
export async function POST(req: Request) {
  const s = await requireUser(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (parseClientSource(req) !== "native") {
    return NextResponse.json({ ok: true, skipped: "web" });
  }

  const body = await req.json().catch(() => null);
  const samples = Array.isArray(body?.samples) ? body.samples : [];
  if (!samples.length) {
    return NextResponse.json({ ok: true, accepted: 0 });
  }

  try {
    const result = await ingestLocationSamples({
      userId: s.sub,
      attendanceId: typeof body?.attendanceId === "string" ? body.attendanceId : null,
      punchId: typeof body?.punchId === "string" ? body.punchId : null,
      appInstallationId: typeof body?.appInstallationId === "string" ? body.appInstallationId : "",
      samples,
      device: {
        appVersion: typeof body?.appVersion === "string" ? body.appVersion : undefined,
        versionCode: Number(body?.versionCode) || 0,
        androidVersion: typeof body?.androidVersion === "string" ? body.androidVersion : undefined,
        manufacturer: typeof body?.manufacturer === "string" ? body.manufacturer : undefined,
        model: typeof body?.model === "string" ? body.model : undefined,
      },
    });
    // Employee-facing: opaque success only.
    return NextResponse.json({ ok: true, accepted: result.accepted });
  } catch {
    // Telemetry failure must not break clients.
    return NextResponse.json({ ok: true, accepted: 0 });
  }
}
