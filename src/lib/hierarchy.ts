export const DESIGNATIONS = ["State", "ZLC", "DLC", "Cluster", "ALC", "Sector Incharge"] as const;

export type Designation = (typeof DESIGNATIONS)[number];

export const DESIGNATION_RANK: Record<string, number> = {
  State: 0,
  ZLC: 1,
  DLC: 2,
  Cluster: 3,
  ALC: 4,
  "Sector Incharge": 5,
};

export type AdminScope = {
  id: string;
  email: string;
  name: string;
  accessLevel: string;
  isSuper: boolean;
  designations: string[];
  zone: string;
  district: string;
  assemblyName: string;
  cluster: string;
};

const NO_USERS = { id: "__none__" };

export function designationsBelow(level: string): string[] {
  const rank = DESIGNATION_RANK[level] ?? 99;
  return DESIGNATIONS.filter((d) => DESIGNATION_RANK[d] > rank);
}

export function defaultVisibleDesignations(level: string): string[] {
  if (level === "State") return [...DESIGNATIONS];
  return designationsBelow(level);
}

export function visibleDesignationsFor(admin: Pick<AdminScope, "isSuper" | "accessLevel" | "designations">): string[] {
  if (admin.isSuper) return [...DESIGNATIONS];
  // State admins always see every designation of users (leave/GPS still use next-level scope)
  if (admin.accessLevel === "State") return [...DESIGNATIONS];
  if (admin.designations.length) return admin.designations;
  return defaultVisibleDesignations(admin.accessLevel);
}

export function isSuperAdmin(admin: Pick<AdminScope, "isSuper">) {
  return Boolean(admin.isSuper);
}

export function canManageAdmins(admin: Pick<AdminScope, "isSuper">) {
  return isSuperAdmin(admin);
}

export function userScopeWhere(admin: AdminScope) {
  if (admin.isSuper) return {};
  // State: all designations statewide — no designation filter
  if (admin.accessLevel === "State") return {};
  const dens = visibleDesignationsFor(admin);
  const where: Record<string, unknown> = {
    designation: { in: dens.length ? dens : ["__none__"] },
  };
  if (admin.accessLevel === "ZLC") {
    if (!admin.zone) return NO_USERS;
    where.zone = admin.zone;
  } else if (admin.accessLevel === "DLC") {
    if (!admin.district) return NO_USERS;
    if (admin.zone) where.zone = admin.zone;
    where.district = admin.district;
  } else if (admin.accessLevel === "Cluster") {
    if (!admin.cluster) return NO_USERS;
    if (admin.zone) where.zone = admin.zone;
    if (admin.district) where.district = admin.district;
    where.cluster = admin.cluster;
  } else if (admin.accessLevel === "ALC") {
    if (!admin.assemblyName) return NO_USERS;
    if (admin.zone) where.zone = admin.zone;
    if (admin.district) where.district = admin.district;
    where.assemblyName = admin.assemblyName;
  } else {
    if (admin.zone) where.zone = admin.zone;
    if (admin.district) where.district = admin.district;
    if (admin.assemblyName) where.assemblyName = admin.assemblyName;
    if (admin.cluster) where.cluster = admin.cluster;
  }
  return where;
}

export function canSeeUser(
  admin: AdminScope,
  user: { designation?: string | null; zone: string; district: string; assemblyName: string; cluster?: string | null }
) {
  if (admin.isSuper) return true;
  if (admin.accessLevel === "State") return true;
  const dens = visibleDesignationsFor(admin);
  if (user.designation && !dens.includes(user.designation)) return false;
  if (admin.accessLevel === "ZLC") return Boolean(admin.zone) && user.zone === admin.zone;
  if (admin.accessLevel === "DLC") return Boolean(admin.district) && user.district === admin.district && (!admin.zone || user.zone === admin.zone);
  if (admin.accessLevel === "Cluster") {
    return Boolean(admin.cluster) && (user.cluster || "") === admin.cluster;
  }
  if (admin.accessLevel === "ALC") {
    return Boolean(admin.assemblyName) && user.assemblyName === admin.assemblyName;
  }
  if (admin.zone && user.zone !== admin.zone) return false;
  if (admin.district && user.district !== admin.district) return false;
  if (admin.assemblyName && user.assemblyName !== admin.assemblyName) return false;
  if (admin.cluster && (user.cluster || "") !== admin.cluster) return false;
  return true;
}

/** Immediate junior designation chain:
 * State→ZLC→DLC→Cluster→ALC→Sector Incharge
 */
export function leaveReviewDesignation(level: string): string | null {
  const rank = DESIGNATION_RANK[level];
  if (rank == null) return null;
  return DESIGNATIONS.find((d) => DESIGNATION_RANK[d] === rank + 1) || null;
}

/** Same geography as users, but only the next designation down (leave + GPS-off). */
export function nextLevelScopeWhere(admin: AdminScope) {
  if (admin.isSuper) return {};
  const next = leaveReviewDesignation(admin.accessLevel);
  if (!next) return NO_USERS;
  const where: Record<string, unknown> = { designation: next };
  if (admin.accessLevel === "ZLC") {
    if (!admin.zone) return NO_USERS;
    where.zone = admin.zone;
  } else if (admin.accessLevel === "DLC") {
    if (!admin.district) return NO_USERS;
    if (admin.zone) where.zone = admin.zone;
    where.district = admin.district;
  } else if (admin.accessLevel === "Cluster") {
    if (!admin.cluster) return NO_USERS;
    if (admin.zone) where.zone = admin.zone;
    if (admin.district) where.district = admin.district;
    where.cluster = admin.cluster;
  } else if (admin.accessLevel === "ALC") {
    if (!admin.assemblyName) return NO_USERS;
    if (admin.zone) where.zone = admin.zone;
    if (admin.district) where.district = admin.district;
    where.assemblyName = admin.assemblyName;
  } else if (admin.accessLevel === "State") {
    // statewide — all next-level (ZLC) users
  } else {
    return NO_USERS;
  }
  return where;
}

/** @deprecated alias — use nextLevelScopeWhere */
export const leaveScopeWhere = nextLevelScopeWhere;

export function canReviewLeave(
  admin: AdminScope,
  user: { designation?: string | null; zone: string; district: string; assemblyName: string; cluster?: string | null }
) {
  if (admin.isSuper) return true;
  const next = leaveReviewDesignation(admin.accessLevel);
  if (!next || user.designation !== next) return false;
  if (admin.accessLevel === "State") return true;
  if (admin.accessLevel === "ZLC") return Boolean(admin.zone) && user.zone === admin.zone;
  if (admin.accessLevel === "DLC") {
    return Boolean(admin.district) && user.district === admin.district && (!admin.zone || user.zone === admin.zone);
  }
  if (admin.accessLevel === "Cluster") {
    return Boolean(admin.cluster) && (user.cluster || "") === admin.cluster;
  }
  if (admin.accessLevel === "ALC") {
    return Boolean(admin.assemblyName) && user.assemblyName === admin.assemblyName;
  }
  return false;
}
