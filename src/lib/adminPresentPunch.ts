import { prisma } from "@/lib/prisma";
import { istDateString } from "@/lib/dailyAttendance";

export function adminPresentLabel(adminName?: string | null, adminEmail?: string | null) {
  return (adminName || "").trim() || (adminEmail || "").trim() || "Admin";
}

export function adminPresentRemark(adminLabel: string) {
  return `Manual present by admin · ${adminLabel}`;
}

function punchAtForDate(dateYmd: string) {
  const today = istDateString();
  if (dateYmd === today) return new Date();
  return new Date(`${dateYmd}T10:00:00+05:30`);
}

/** Create a closed attendance row so dashboard Punched counts this user. */
export async function ensureAdminPresentPunch(opts: {
  userId: string;
  dateYmd: string;
  start: Date;
  end: Date;
  adminLabel: string;
  note: string;
}) {
  const existing = await prisma.attendance.findFirst({
    where: { userId: opts.userId, punchInAt: { gte: opts.start, lte: opts.end } },
    select: { id: true, punchOutReason: true },
  });
  if (existing) {
    if (existing.punchOutReason === "admin_present") {
      const remark = adminPresentRemark(opts.adminLabel);
      await prisma.attendance.update({
        where: { id: existing.id },
        data: {
          punchInAddress: remark,
          punchOutAddress: opts.note,
        },
      });
    }
    return;
  }

  const when = punchAtForDate(opts.dateYmd);
  const remark = adminPresentRemark(opts.adminLabel);
  await prisma.attendance.create({
    data: {
      userId: opts.userId,
      punchInAt: when,
      punchOutAt: when,
      punchInLat: 0,
      punchInLng: 0,
      punchOutLat: 0,
      punchOutLng: 0,
      punchInAddress: remark,
      punchOutAddress: opts.note,
      punchOutReason: "admin_present",
    },
  });
}

/** If present was only an admin mark, remove it so the user returns to pending punch-in. */
export async function removeAdminPresentPunch(opts: { userId: string; start: Date; end: Date }) {
  await prisma.attendance.deleteMany({
    where: {
      userId: opts.userId,
      punchInAt: { gte: opts.start, lte: opts.end },
      punchOutReason: "admin_present",
    },
  });
}
