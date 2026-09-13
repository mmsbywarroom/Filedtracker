import { prisma } from "@/lib/prisma";
import {
  AdminScope,
  canSeeUser,
  isSuperAdmin,
  normalizeAccessLevel,
} from "@/lib/hierarchy";
import { hoursWorkedOnDay, istDateString, istDayBounds } from "@/lib/dailyAttendance";
import {
  adminPresentLabel,
  adminPresentRemark,
  closeOpenPunchForAdminLeave,
  ensureAdminPresentPunch,
  removeAdminPresentPunch,
} from "@/lib/adminPresentPunch";

export type AttendanceMarkStatus = "present" | "half_day" | "absent" | "leave";
export type AttendanceReviewLevel = "DLC" | "ZLC";

/** Cluster / ALC → DLC; DLC → ZLC; others apply immediately. */
export function attendanceChangeReviewLevel(
  accessLevel: string,
  isSuper?: boolean
): AttendanceReviewLevel | null {
  if (isSuper) return null;
  const n = normalizeAccessLevel(accessLevel);
  if (n === "Cluster" || n === "ALC") return "DLC";
  if (n === "DLC") return "ZLC";
  return null;
}

export function canReviewAttendanceChangeRequest(
  admin: AdminScope,
  request: {
    reviewLevel: string;
    user: {
      designation: string;
      zone: string;
      district: string;
      assemblyName: string;
      cluster: string;
      assemblies?: string[];
    };
  }
): boolean {
  if (isSuperAdmin(admin) || normalizeAccessLevel(admin.accessLevel) === "State") {
    return canSeeUser(admin, request.user) || isSuperAdmin(admin);
  }
  const level = normalizeAccessLevel(admin.accessLevel);
  if (request.reviewLevel === "DLC" && level === "DLC") {
    return canSeeUser(admin, request.user);
  }
  if (request.reviewLevel === "ZLC" && level === "ZLC") {
    return canSeeUser(admin, request.user);
  }
  return false;
}

/** List filter for pending (and other) attendance change requests for this admin. */
export function attendanceChangeListWhere(admin: AdminScope) {
  if (isSuperAdmin(admin) || normalizeAccessLevel(admin.accessLevel) === "State") {
    return {};
  }
  const level = normalizeAccessLevel(admin.accessLevel);
  if (level === "DLC") {
    const district = (admin.district || "").trim();
    if (!district) return { id: "__none__" };
    const zone = (admin.zone || "").trim();
    return {
      reviewLevel: "DLC",
      user: {
        district: { equals: district, mode: "insensitive" as const },
        ...(zone ? { zone: { equals: zone, mode: "insensitive" as const } } : {}),
      },
    };
  }
  if (level === "ZLC") {
    const zone = (admin.zone || "").trim();
    if (!zone) return { id: "__none__" };
    return {
      reviewLevel: "ZLC",
      user: { zone: { equals: zone, mode: "insensitive" as const } },
    };
  }
  // Cluster / ALC / Zone Coord: only their own requests
  return { requestedById: admin.id || "__none__" };
}

export async function applyManualAttendanceMark(opts: {
  userId: string;
  dateYmd: string;
  status: AttendanceMarkStatus;
  note: string;
  adminId: string;
  adminName: string | null;
  adminEmail: string;
}) {
  const { dateOnly, start, end } = istDayBounds(opts.dateYmd);
  const sessions = await prisma.attendance.findMany({
    where: { userId: opts.userId, punchInAt: { gte: start, lte: end } },
    select: { punchInAt: true, punchOutAt: true },
  });
  const hours = hoursWorkedOnDay(sessions, opts.dateYmd === istDateString() ? new Date() : end);
  const adminLabel = adminPresentLabel(opts.adminName, opts.adminEmail);
  const storedNote =
    opts.status === "present" ? `${adminPresentRemark(adminLabel)}. ${opts.note}` : opts.note;

  if (opts.status === "present") {
    await ensureAdminPresentPunch({
      userId: opts.userId,
      dateYmd: opts.dateYmd,
      start,
      end,
      adminLabel,
      note: opts.note,
    });
  } else if (opts.status === "leave") {
    await removeAdminPresentPunch({ userId: opts.userId, start, end });
    await closeOpenPunchForAdminLeave({
      userId: opts.userId,
      start,
      end,
      adminLabel,
      note: opts.note,
    });
  } else {
    await removeAdminPresentPunch({ userId: opts.userId, start, end });
  }

  const mark = await prisma.dailyAttendanceMark.upsert({
    where: { userId_date: { userId: opts.userId, date: dateOnly } },
    create: {
      userId: opts.userId,
      date: dateOnly,
      status: opts.status,
      source: "manual",
      hoursWorked: hours,
      note: storedNote,
      markedBy: opts.adminId,
    },
    update: {
      status: opts.status,
      source: "manual",
      hoursWorked: hours,
      note: storedNote,
      markedBy: opts.adminId,
    },
  });

  return mark;
}
