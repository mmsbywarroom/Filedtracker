import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeUser } from "@/lib/hierarchy";
import {
  coordKey,
  dominantCoordGroup,
  filterValidIntervalSnapshots,
  isValidIntervalSnapshot,
  slotDueAtMs,
  slotLabel,
} from "@/lib/attendanceIntervalFlag";
import { istDayBounds } from "@/lib/dailyAttendance";

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = (searchParams.get("userId") || "").trim();
  const date = (searchParams.get("date") || "").trim();
  if (!userId || !date) {
    return NextResponse.json({ error: "userId and date are required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      phone: true,
      designation: true,
      assemblyName: true,
      zone: true,
      district: true,
    },
  });
  if (!user || !canSeeUser(s.admin, user)) {
    return NextResponse.json({ error: "User not in your scope." }, { status: 403 });
  }

  const { start, end } = istDayBounds(date);
  const sessions = await prisma.attendance.findMany({
    where: { userId, punchInAt: { gte: start, lte: end }, punchInClient: "native" },
    orderBy: { punchInAt: "asc" },
    select: {
      id: true,
      punchInAt: true,
      punchOutAt: true,
      punchInClient: true,
      intervalSnapshots: {
        orderBy: { slot: "asc" },
        select: { slot: true, lat: true, lng: true, recordedAt: true, scheduledAt: true },
      },
    },
  });

  const mapped = sessions.map((sess) => {
    const validSnaps = filterValidIntervalSnapshots(
      sess.intervalSnapshots.map((snap) => ({ ...snap, punchInAt: sess.punchInAt }))
    );
    const dominant = dominantCoordGroup(validSnaps);
    const dominantKey = dominant?.key || "";
    const snapshots = sess.intervalSnapshots.map((snap) => {
      const scheduledAt = snap.scheduledAt
        ? snap.scheduledAt.toISOString()
        : new Date(slotDueAtMs(sess.punchInAt, snap.slot)).toISOString();
      const valid = isValidIntervalSnapshot(sess.punchInAt, snap.slot, snap.recordedAt);
      return {
        slot: snap.slot,
        slotLabel: slotLabel(snap.slot),
        scheduledAt,
        lat: snap.lat,
        lng: snap.lng,
        recordedAt: snap.recordedAt.toISOString(),
        valid,
        sameGroup: valid && coordKey(snap.lat, snap.lng) === dominantKey,
      };
    });
    const validOnly = snapshots.filter((x) => x.valid);
    return {
      attendanceId: sess.id,
      punchInAt: sess.punchInAt.toISOString(),
      punchOutAt: sess.punchOutAt?.toISOString() || null,
      snapshotCount: validOnly.length,
      invalidCount: snapshots.length - validOnly.length,
      dominantCount: dominant?.count || 0,
      dominantCoord: dominantKey || null,
      sameSnapshots: validOnly.filter((x) => x.sameGroup),
      snapshots,
    };
  });

  const allSame = mapped.flatMap((sess) => sess.sameSnapshots);

  return NextResponse.json({
    date,
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      designation: user.designation,
      assemblyName: user.assemblyName,
      zone: user.zone,
      district: user.district,
    },
    sessions: mapped,
    sameSnapshots: allSame,
    sameCount: allSame.length,
  });
}
