import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeUser } from "@/lib/hierarchy";
import { coordKey, dominantCoordGroup, slotLabel } from "@/lib/attendanceIntervalFlag";
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
    where: { userId, punchInAt: { gte: start, lte: end } },
    orderBy: { punchInAt: "asc" },
    select: {
      id: true,
      punchInAt: true,
      punchOutAt: true,
      intervalSnapshots: {
        orderBy: { slot: "asc" },
        select: { slot: true, lat: true, lng: true, recordedAt: true },
      },
    },
  });

  const mapped = sessions.map((sess) => {
    const dominant = dominantCoordGroup(sess.intervalSnapshots);
    const dominantKey = dominant?.key || "";
    const snapshots = sess.intervalSnapshots.map((snap) => ({
      slot: snap.slot,
      slotLabel: slotLabel(snap.slot),
      lat: snap.lat,
      lng: snap.lng,
      recordedAt: snap.recordedAt.toISOString(),
      sameGroup: coordKey(snap.lat, snap.lng) === dominantKey,
    }));
    return {
      attendanceId: sess.id,
      punchInAt: sess.punchInAt.toISOString(),
      punchOutAt: sess.punchOutAt?.toISOString() || null,
      snapshotCount: snapshots.length,
      dominantCount: dominant?.count || 0,
      dominantCoord: dominantKey || null,
      sameSnapshots: snapshots.filter((x) => x.sameGroup),
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
