import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { parseClientSource } from "@/lib/clientSource";
import { consumePunchChallenge } from "@/lib/locationIntegrity/challenge";
import { upsertPunchSecuritySummary } from "@/lib/locationIntegrity/ingestSamples";
import { verifyPlayIntegrityToken } from "@/lib/locationIntegrity/playIntegrity";
import { prisma } from "@/lib/prisma";

/**
 * Optional Play Integrity ingest for sideloaded APKs.
 * Never blocks attendance. Opaque {ok:true} only.
 * UNLICENSED / UNRECOGNIZED_VERSION / UNEVALUATED are expected — not fraud.
 */
export async function POST(req: Request) {
  const s = await requireUser(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (parseClientSource(req) !== "native") {
    return NextResponse.json({ ok: true, skipped: "web" });
  }

  const body = await req.json().catch(() => null);
  const punchId = typeof body?.punchId === "string" ? body.punchId : "";
  const challenge = typeof body?.challenge === "string" ? body.challenge : "";
  const punchType = body?.punchType === "punch_out" ? "punch_out" : "punch_in";
  const attendanceId = typeof body?.attendanceId === "string" ? body.attendanceId : null;
  const token = typeof body?.integrityToken === "string" ? body.integrityToken : "";
  const vpnActive = Boolean(body?.vpnActive);
  const appInstallationId = typeof body?.appInstallationId === "string" ? body.appInstallationId : "";

  let playStatus = "NOT_CHECKED";
  let playFailed = false;
  let strongTamper = false;
  let playSummary = "";

  if (punchId && challenge) {
    const consumed = await consumePunchChallenge({ userId: s.sub, punchId, challenge });
    if (!consumed.ok) {
      try {
        await prisma.attendanceSecurityEvent.create({
          data: {
            eventId: `ev_replay_${punchId}_${Date.now()}`,
            userId: s.sub,
            punchId,
            attendanceId,
            appInstallationId: appInstallationId.slice(0, 128),
            eventType: "PLAY_INTEGRITY_UNAVAILABLE",
            eventTimestamp: new Date(),
            riskWeight: 5,
            confidence: "SUPPORTING",
            playIntegritySummary: consumed.error,
            metadataJson: JSON.stringify({
              reason: consumed.error,
              replayOrExpired: true,
              distributionModel: "sideload_apk",
              note: "Challenge lifecycle anomaly — supporting only; does not block attendance",
            }),
          },
        });
      } catch {
        // ignore
      }
      // Supporting only — do not treat challenge issues as fraud for sideload risk.
      playStatus = "UNAVAILABLE";
      playFailed = false;
      strongTamper = false;
      playSummary = consumed.error;
    } else {
      const verified = await verifyPlayIntegrityToken({
        token,
        expectedRequestHash: consumed.row.requestHash || "",
        expectedPackageName: process.env.PLAY_INTEGRITY_PACKAGE_NAME || "in.videh.filedtracker.native",
      });

      playStatus = verified.status;
      playSummary = verified.summary;
      // Only binding anomalies contribute light supporting weight — never app/license sideload verdicts.
      playFailed = verified.fraudRelevant && verified.status !== "OK";
      strongTamper = verified.strongTamper;

      try {
        await prisma.attendanceSecurityEvent.create({
          data: {
            eventId:
              verified.status === "HASH_MISMATCH"
                ? `ev_hash_mismatch_${punchId}`
                : `ev_integrity_${punchId}`,
            userId: s.sub,
            punchId,
            attendanceId,
            appInstallationId: appInstallationId.slice(0, 128),
            eventType:
              verified.status === "OK"
                ? "PLAY_INTEGRITY_OK"
                : verified.status === "HASH_MISMATCH"
                  ? "PLAY_INTEGRITY_REQUEST_HASH_MISMATCH"
                  : verified.status === "FAILED"
                    ? "PLAY_INTEGRITY_FAILURE"
                    : "PLAY_INTEGRITY_UNAVAILABLE",
            eventTimestamp: new Date(),
            riskWeight: verified.fraudRelevant ? 5 : 0,
            confidence: "SUPPORTING",
            playIntegritySummary: playSummary.slice(0, 500),
            vpnActive,
            metadataJson: JSON.stringify({
              ...verified.details,
              distributionModel: "sideload_apk",
              primaryFakeGpsEvidence: "LocationCompat.isMock",
              note: "Play Integrity is optional/supporting for direct-APK distribution",
            }).slice(0, 3500),
          },
        });
      } catch {
        // dedupe
      }
    }
  }

  if (punchId) {
    try {
      await upsertPunchSecuritySummary({
        userId: s.sub,
        attendanceId,
        punchId,
        punchType,
        appInstallationId,
        vpnActive,
        playIntegrityStatus: playStatus,
        playIntegrityFailed: playFailed,
        playIntegrityStrongTamper: strongTamper,
      });
    } catch {
      // ignore
    }
  }

  if (vpnActive) {
    try {
      await prisma.attendanceSecurityEvent.create({
        data: {
          eventId: `ev_vpn_${punchId || "bg"}_${Math.floor(Date.now() / 60000)}`,
          userId: s.sub,
          punchId: punchId || null,
          attendanceId,
          appInstallationId: appInstallationId.slice(0, 128),
          eventType: "VPN_ACTIVE",
          eventTimestamp: new Date(),
          vpnActive: true,
          riskWeight: 5,
          confidence: "SUPPORTING",
          metadataJson: JSON.stringify({
            note: "VPN alone is supporting evidence only — not a direct fake GPS verdict",
          }),
        },
      });
    } catch {
      // throttle
    }
  }

  // Never leak detection fields to the employee client.
  return NextResponse.json({ ok: true });
}
