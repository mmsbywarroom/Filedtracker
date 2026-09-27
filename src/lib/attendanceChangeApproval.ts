import { prisma } from "@/lib/prisma";
import {
  AdminScope,
  canSeeUser,
  isSuperAdmin,
  isZoneScopedAdmin,
  normalizeAccessLevel,
  userScopeWhere,
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
export type AttendanceReviewLevel = "DLC" | "ZLC" | "BOTH";
export type AttendanceReviewSide = "dlc" | "cluster" | "both";

/** ALC → DLC and Cluster must both approve. DLC and Cluster apply immediately (logged separately). */
export function attendanceChangeReviewLevel(
  accessLevel: string,
  isSuper?: boolean
): AttendanceReviewLevel | null {
  if (isSuper) return null;
  const n = normalizeAccessLevel(accessLevel);
  if (n === "ALC") return "BOTH";
  return null;
}

type ReviewRequest = {
  status: string;
  reviewLevel: string;
  dlcDecision?: string | null;
  clusterDecision?: string | null;
  user: {
    designation: string;
    zone: string;
    district: string;
    assemblyName: string;
    cluster: string;
    assemblies?: string[];
  };
};

/** Which side this admin can still decide. Null if they cannot act. */
export function attendanceReviewSide(admin: AdminScope, request: ReviewRequest): AttendanceReviewSide | null {
  if (request.status !== "pending") return null;
  const level = normalizeAccessLevel(admin.accessLevel);
  const superish = isSuperAdmin(admin) || level === "State";
  const visible = canSeeUser(admin, request.user) || isSuperAdmin(admin);

  if (request.reviewLevel === "BOTH") {
    const dlcOpen = (request.dlcDecision || "pending") === "pending";
    const clusterOpen = (request.clusterDecision || "pending") === "pending";
    if (!dlcOpen && !clusterOpen) return null;
    if (superish && visible) return "both";
    if (level === "DLC" && dlcOpen && canSeeUser(admin, request.user)) return "dlc";
    if (level === "Cluster" && clusterOpen && canSeeUser(admin, request.user)) return "cluster";
    return null;
  }

  if (!visible) return null;
  if (superish) return "both";
  if (request.reviewLevel === "DLC" && level === "DLC" && canSeeUser(admin, request.user)) return "dlc";
  if (request.reviewLevel === "ZLC" && (level === "ZLC" || isZoneScopedAdmin(level)) && canSeeUser(admin, request.user)) {
    return "both";
  }
  return null;
}

export function canReviewAttendanceChangeRequest(admin: AdminScope, request: ReviewRequest): boolean {
  return attendanceReviewSide(admin, request) !== null;
}

/**
 * List filter for attendance change requests for this admin.
 * Super / State: all. DLC: legacy DLC queue plus ALC requests that need DLC.
 * Cluster: ALC requests that need Cluster. ZLC: legacy ZLC queue.
 * ALC: only requests they submitted.
 */
export function attendanceChangeListWhere(admin: AdminScope) {
  if (isSuperAdmin(admin) || normalizeAccessLevel(admin.accessLevel) === "State") {
    return {};
  }
  const level = normalizeAccessLevel(admin.accessLevel);
  if (level === "DLC") {
    return {
      user: userScopeWhere(admin),
      OR: [{ reviewLevel: "DLC" }, { reviewLevel: "BOTH" }],
    };
  }
  if (level === "Cluster") {
    return {
      user: userScopeWhere(admin),
      reviewLevel: "BOTH",
    };
  }
  if (level === "ZLC" || isZoneScopedAdmin(level)) {
    return {
      reviewLevel: "ZLC",
      user: userScopeWhere(admin),
    };
  }
  return { requestedById: admin.id || "__none__" };
}

/** Pending items still waiting on this admin's decision. */
export function attendanceChangePendingWhere(admin: AdminScope) {
  const list = attendanceChangeListWhere(admin);
  const level = normalizeAccessLevel(admin.accessLevel);
  if (level === "DLC" && !isSuperAdmin(admin)) {
    return {
      AND: [
        list,
        { status: "pending" },
        {
          OR: [{ reviewLevel: "DLC" }, { reviewLevel: "BOTH", dlcDecision: "pending" }],
        },
      ],
    };
  }
  if (level === "Cluster" && !isSuperAdmin(admin)) {
    return {
      AND: [list, { status: "pending" }, { clusterDecision: "pending" }],
    };
  }
  return { AND: [list, { status: "pending" }] };
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
