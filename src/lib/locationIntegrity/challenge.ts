import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

/** Challenge TTL — short window to prevent replay. */
export const PUNCH_CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * Canonical requestHash for Standard Play Integrity binding.
 * Server is the authority — Android must use the hash returned by /challenge, not invent its own.
 *
 * Fields (pipe-separated, deterministic):
 * punchId|employeeId|attendanceSessionId|punchType|challenge
 */
export function computePunchRequestHash(opts: {
  punchId: string;
  employeeId: string;
  attendanceSessionId: string | null | undefined;
  punchType: string;
  challenge: string;
}): string {
  const attendanceSessionId = opts.attendanceSessionId?.trim() || "";
  const canonical = [
    opts.punchId.trim(),
    opts.employeeId.trim(),
    attendanceSessionId,
    opts.punchType.trim(),
    opts.challenge.trim(),
  ].join("|");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export async function createPunchChallenge(opts: {
  userId: string;
  punchType: "punch_in" | "punch_out";
  attendanceId?: string | null;
}) {
  const punchId = `p_${randomBytes(16).toString("hex")}`;
  const challenge = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + PUNCH_CHALLENGE_TTL_MS);
  const requestHash = computePunchRequestHash({
    punchId,
    employeeId: opts.userId,
    attendanceSessionId: opts.attendanceId,
    punchType: opts.punchType,
    challenge,
  });

  await prisma.punchSecurityChallenge.create({
    data: {
      punchId,
      userId: opts.userId,
      attendanceId: opts.attendanceId || null,
      punchType: opts.punchType,
      challenge,
      requestHash,
      expiresAt,
    },
  });

  return {
    punchId,
    challenge,
    requestHash,
    expiresAt: expiresAt.toISOString(),
    ttlMs: PUNCH_CHALLENGE_TTL_MS,
  };
}

export async function consumePunchChallenge(opts: {
  userId: string;
  punchId: string;
  challenge: string;
}) {
  const row = await prisma.punchSecurityChallenge.findUnique({ where: { punchId: opts.punchId } });
  if (!row) return { ok: false as const, error: "Unknown punchId" };
  if (row.userId !== opts.userId) return { ok: false as const, error: "punchId mismatch" };
  if (row.consumedAt) return { ok: false as const, error: "Challenge already used (replay)" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false as const, error: "Challenge expired" };
  if (row.challenge !== opts.challenge) return { ok: false as const, error: "Invalid challenge" };

  // Recompute expected hash from stored canonical fields (never trust client hash).
  const expectedHash = computePunchRequestHash({
    punchId: row.punchId,
    employeeId: row.userId,
    attendanceSessionId: row.attendanceId,
    punchType: row.punchType,
    challenge: row.challenge,
  });

  await prisma.punchSecurityChallenge.update({
    where: { punchId: opts.punchId },
    data: { consumedAt: new Date(), requestHash: expectedHash },
  });

  return { ok: true as const, row: { ...row, requestHash: expectedHash } };
}
