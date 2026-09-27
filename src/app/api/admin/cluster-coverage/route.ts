import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  adminAssemblies,
  cleanScope,
  isZoneScopedAdmin,
  normalizeAccessLevel,
  userScopeWhere,
  type AdminScope,
} from "@/lib/hierarchy";
import {
  istDateString,
  istDayBounds,
  resolveDayAttendanceStatus,
  type ResolvedAttendanceStatus,
} from "@/lib/dailyAttendance";
import { holidayAppliesTo, holidayLeaveReason } from "@/lib/holidays";
import { isUnrestrictedPunchPhone } from "@/lib/punchInWindow";
import { isAttendanceEligibleOnDay } from "@/lib/userActiveOnDay";

type ClusterAdmin = {
  id: string;
  name: string;
  email: string;
  zone: string;
  district: string;
  cluster: string;
  assemblyName: string;
  assemblies: string[];
  accessLevel: string;
};

type Bucket = {
  alc: number;
  sectorIncharge: number;
  total: number;
  punched: number;
  present: number;
  halfDay: number;
  absent: number;
  leave: number;
};

function emptyBucket(): Bucket {
  return {
    alc: 0,
    sectorIncharge: 0,
    total: 0,
    punched: 0,
    present: 0,
    halfDay: 0,
    absent: 0,
    leave: 0,
  };
}

function sameText(a: string, b: string) {
  return cleanScope(a).toLowerCase() === cleanScope(b).toLowerCase();
}

function assembliesOverlap(a: string[], b: string[]) {
  const set = new Set(b.map((x) => x.toLowerCase()));
  return a.some((x) => set.has(x.toLowerCase()));
}

function clusterAdminVisible(viewer: AdminScope, clusterAdmin: ClusterAdmin) {
  if (viewer.isSuper) return true;
  const level = normalizeAccessLevel(viewer.accessLevel);
  if (level === "State") return true;
  if (level === "Cluster") return clusterAdmin.id === viewer.id;

  const viewerAssemblies = adminAssemblies(viewer);
  const clusterAssemblies = adminAssemblies(clusterAdmin);

  if (isZoneScopedAdmin(level)) {
    const zone = cleanScope(viewer.zone);
    if (zone) return sameText(clusterAdmin.zone, zone);
    if (viewerAssemblies.length && clusterAssemblies.length) {
      return assembliesOverlap(viewerAssemblies, clusterAssemblies);
    }
    return false;
  }

  if (level === "DLC") {
    const district = cleanScope(viewer.district);
    if (district && sameText(clusterAdmin.district, district)) {
      if (!viewerAssemblies.length || !clusterAssemblies.length) return true;
      return assembliesOverlap(viewerAssemblies, clusterAssemblies);
    }
    if (viewerAssemblies.length && clusterAssemblies.length) {
      return assembliesOverlap(viewerAssemblies, clusterAssemblies);
    }
    return false;
  }

  if (level === "ALC") {
    const assembly = cleanScope(viewer.assemblyName);
    if (!assembly) return false;
    if (clusterAssemblies.some((a) => sameText(a, assembly))) return true;
    return sameText(clusterAdmin.assemblyName, assembly);
  }

  return false;
}

function userMatchesClusterAdmin(
  user: { assemblyName: string; cluster: string },
  clusterAdmin: ClusterAdmin
) {
  const assemblies = adminAssemblies(clusterAdmin);
  const userAssembly = cleanScope(user.assemblyName);
  if (assemblies.length) {
    return Boolean(userAssembly) && assemblies.some((a) => sameText(a, userAssembly));
  }
  const cluster = cleanScope(clusterAdmin.cluster);
  if (!cluster) return false;
  return sameText(user.cluster, cluster);
}

function addStatus(bucket: Bucket, designation: string, status: ResolvedAttendanceStatus, punched: boolean) {
  bucket.total += 1;
  if (designation === "ALC") bucket.alc += 1;
  else if (designation === "Sector Incharge") bucket.sectorIncharge += 1;
  if (punched) bucket.punched += 1;
  if (status === "present") bucket.present += 1;
  else if (status === "half_day") bucket.halfDay += 1;
  else if (status === "leave") bucket.leave += 1;
  else bucket.absent += 1;
}

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const date = new URL(req.url).searchParams.get("date") || istDateString();
  const { start, end, dateOnly } = istDayBounds(date);
  const asOf = date === istDateString() ? new Date() : end;

  const [adminRows, users, holiday] = await Promise.all([
    prisma.admin.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        accessLevel: true,
        zone: true,
        district: true,
        assemblyName: true,
        assemblies: true,
        cluster: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: {
        AND: [
          userScopeWhere(s.admin),
          { isActive: true },
          { designation: { in: ["ALC", "Sector Incharge"] } },
        ],
      },
      select: {
        id: true,
        phone: true,
        designation: true,
        assemblyName: true,
        cluster: true,
        isActive: true,
        deactivatedAt: true,
      },
    }),
    prisma.holiday.findUnique({ where: { date: dateOnly } }),
  ]);

  const clusterAdmins = adminRows
    .filter((a) => normalizeAccessLevel(a.accessLevel) === "Cluster")
    .filter((a) => clusterAdminVisible(s.admin, a))
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));

  const eligible = users.filter((u) =>
    isAttendanceEligibleOnDay({ isActive: u.isActive, deactivatedAt: u.deactivatedAt, dateYmd: date })
  );
  const userIds = eligible.map((u) => u.id);

  const [punches, allMarks, approvedLeaves] = await Promise.all([
    userIds.length
      ? prisma.attendance.findMany({
          where: { userId: { in: userIds }, punchInAt: { gte: start, lte: end } },
          select: { userId: true, punchInAt: true, punchOutAt: true },
        })
      : Promise.resolve([]),
    userIds.length
      ? prisma.dailyAttendanceMark.findMany({
          where: { date: dateOnly, userId: { in: userIds } },
          select: { userId: true, status: true, source: true, note: true },
        })
      : Promise.resolve([]),
    userIds.length
      ? prisma.leaveRequest.findMany({
          where: {
            userId: { in: userIds },
            status: "approved",
            fromDate: { lte: end },
            toDate: { gte: start },
          },
          select: { userId: true },
        })
      : Promise.resolve([]),
  ]);

  const punchesByUser = new Map<string, { punchInAt: Date; punchOutAt: Date | null }[]>();
  for (const p of punches) {
    const list = punchesByUser.get(p.userId) || [];
    list.push({ punchInAt: p.punchInAt, punchOutAt: p.punchOutAt });
    punchesByUser.set(p.userId, list);
  }
  const markByUser = new Map(allMarks.map((m) => [m.userId, m]));
  const approvedLeaveIds = new Set(approvedLeaves.map((l) => l.userId));

  const buckets = new Map<string, Bucket>();
  for (const admin of clusterAdmins) buckets.set(admin.id, emptyBucket());
  const unassigned = emptyBucket();
  const summary = emptyBucket();

  for (const u of eligible) {
    const mark = markByUser.get(u.id);
    const resolved = resolveDayAttendanceStatus({
      sessions: punchesByUser.get(u.id) || [],
      asOf,
      dateYmd: date,
      onApprovedLeave: approvedLeaveIds.has(u.id),
      isHoliday: holidayAppliesTo(holiday, u.designation),
      holidayReason: holidayAppliesTo(holiday, u.designation)
        ? holidayLeaveReason(holiday!.reason, u.designation)
        : null,
      manual: mark ? { status: mark.status, source: mark.source, note: mark.note } : null,
      allowBeforeEarliest: isUnrestrictedPunchPhone(u.phone),
    });
    const punched = (punchesByUser.get(u.id) || []).length > 0;
    const owner = clusterAdmins.find((a) => userMatchesClusterAdmin(u, a));
    const bucket = owner ? buckets.get(owner.id)! : unassigned;
    addStatus(bucket, u.designation, resolved.status, punched);
    addStatus(summary, u.designation, resolved.status, punched);
  }

  const rows = clusterAdmins.map((a) => ({
    id: a.id,
    name: (a.name || "").trim() || a.email,
    email: a.email,
    zone: cleanScope(a.zone),
    district: cleanScope(a.district),
    cluster: cleanScope(a.cluster),
    assemblies: adminAssemblies(a),
    ...buckets.get(a.id)!,
  }));

  if (unassigned.total > 0) {
    rows.push({
      id: "unassigned",
      name: "Not mapped to a cluster admin",
      email: "",
      zone: "",
      district: "",
      cluster: "",
      assemblies: [],
      ...unassigned,
    });
  }

  return NextResponse.json({
    date,
    accessLevel: normalizeAccessLevel(s.admin.accessLevel) || s.admin.accessLevel,
    clusterAdmins: clusterAdmins.length,
    summary,
    rows,
  });
}
