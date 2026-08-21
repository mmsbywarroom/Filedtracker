export const DESIGNATIONS = ["State", "ZLC", "DLC", "Cluster", "ALC", "Sector Incharge"] as const;

export type Designation = (typeof DESIGNATIONS)[number];

/** Admin login levels (Zone Coordinator is zone-scoped like ZLC). */
export const ADMIN_LEVELS = ["State", "Zone Coordinator", "ZLC", "DLC", "Cluster", "ALC"] as const;

export type AdminLevel = (typeof ADMIN_LEVELS)[number];

export const DESIGNATION_RANK: Record<string, number> = {
  State: 0,
  "Zone Coordinator": 1,
  ZLC: 1,
  DLC: 2,
  Cluster: 3,
  ALC: 4,
  "Sector Incharge": 5,
};

/** Field users a DLC/Cluster admin sees under mapped assemblies */
export const ASSEMBLY_SCOPED_DESIGNATIONS = ["ALC", "Sector Incharge"] as const;

/** What Zone Coordinator / ZLC admins see by default */
export const ZONE_SCOPED_DESIGNATIONS = ["DLC", "Cluster", "ALC", "Sector Incharge"] as const;

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
  assemblies: string[];
  cluster: string;
};

const NO_USERS = { id: "__none__" };

export function isZoneScopedAdmin(level: string) {
  return level === "ZLC" || level === "Zone Coordinator";
}

export function designationsBelow(level: string): string[] {
  const rank = DESIGNATION_RANK[level] ?? 99;
  return DESIGNATIONS.filter((d) => DESIGNATION_RANK[d] > rank);
}

export function defaultVisibleDesignations(level: string): string[] {
  if (level === "State") return [...DESIGNATIONS];
  if (isZoneScopedAdmin(level)) return [...ZONE_SCOPED_DESIGNATIONS];
  if (level === "DLC" || level === "Cluster") return [...ASSEMBLY_SCOPED_DESIGNATIONS];
  return designationsBelow(level);
}

export function visibleDesignationsFor(admin: Pick<AdminScope, "isSuper" | "accessLevel" | "designations">): string[] {
  if (admin.isSuper) return [...DESIGNATIONS];
  // State admins always see every designation of users (leave/GPS still use next-level scope)
  if (admin.accessLevel === "State") return [...DESIGNATIONS];
  if (isZoneScopedAdmin(admin.accessLevel)) {
    if (admin.designations.length) {
      const scoped = admin.designations.filter((d) =>
        (ZONE_SCOPED_DESIGNATIONS as readonly string[]).includes(d)
      );
      return scoped.length ? scoped : [...ZONE_SCOPED_DESIGNATIONS];
    }
    return [...ZONE_SCOPED_DESIGNATIONS];
  }
  if (admin.accessLevel === "DLC" || admin.accessLevel === "Cluster") {
    if (admin.designations.length) {
      const scoped = admin.designations.filter((d) =>
        (ASSEMBLY_SCOPED_DESIGNATIONS as readonly string[]).includes(d)
      );
      return scoped.length ? scoped : [...ASSEMBLY_SCOPED_DESIGNATIONS];
    }
    return [...ASSEMBLY_SCOPED_DESIGNATIONS];
  }
  if (admin.designations.length) return admin.designations;
  return defaultVisibleDesignations(admin.accessLevel);
}

export function isSuperAdmin(admin: Pick<AdminScope, "isSuper">) {
  return Boolean(admin.isSuper);
}

export function canManageAdmins(admin: Pick<AdminScope, "isSuper">) {
  return isSuperAdmin(admin);
}

/** Parse assemblies list from admin record (array or pipe-separated assemblyName). */
export function adminAssemblies(admin: Pick<AdminScope, "assemblies" | "assemblyName" | "accessLevel">): string[] {
  const fromArr = (admin.assemblies || []).map((a) => a.trim()).filter(Boolean);
  if (fromArr.length) return Array.from(new Set(fromArr));
  const raw = String(admin.assemblyName || "").trim();
  if (!raw) return [];
  if (/[|;,]/.test(raw)) {
    return Array.from(new Set(raw.split(/[|;,]/).map((a) => a.trim()).filter(Boolean)));
  }
  if (admin.accessLevel === "ALC") return [raw];
  return [];
}

export function parseAssembliesInput(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((a) => String(a || "").trim()).filter(Boolean)));
  }
  if (typeof raw === "string") {
    return Array.from(new Set(raw.split(/[|;,]/).map((a) => a.trim()).filter(Boolean)));
  }
  return [];
}

export function userScopeWhere(admin: AdminScope) {
  if (admin.isSuper) return {};
  // State: all designations statewide — no designation filter
  if (admin.accessLevel === "State") return {};
  const dens = visibleDesignationsFor(admin);
  const where: Record<string, unknown> = {
    designation: { in: dens.length ? dens : ["__none__"] },
  };
  if (isZoneScopedAdmin(admin.accessLevel)) {
    if (!admin.zone) return NO_USERS;
    where.zone = admin.zone;
  } else if (admin.accessLevel === "DLC" || admin.accessLevel === "Cluster") {
    const assemblies = adminAssemblies(admin);
    if (!assemblies.length) return NO_USERS;
    where.assemblyName = { in: assemblies };
    if (admin.zone) where.zone = admin.zone;
    if (admin.district) where.district = admin.district;
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
  if (isZoneScopedAdmin(admin.accessLevel)) return Boolean(admin.zone) && user.zone === admin.zone;
  if (admin.accessLevel === "DLC" || admin.accessLevel === "Cluster") {
    const assemblies = adminAssemblies(admin);
    if (!assemblies.length) return false;
    if (!assemblies.includes(user.assemblyName)) return false;
    if (admin.zone && user.zone !== admin.zone) return false;
    if (admin.district && user.district !== admin.district) return false;
    return true;
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
 * State→ZLC/Zone Coordinator→DLC→Cluster→ALC→Sector Incharge
 */
export function leaveReviewDesignation(level: string): string | null {
  if (isZoneScopedAdmin(level)) return "DLC";
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
  if (isZoneScopedAdmin(admin.accessLevel)) {
    if (!admin.zone) return NO_USERS;
    where.zone = admin.zone;
  } else if (admin.accessLevel === "DLC") {
    // Leave/GPS: next level is Cluster — keep district scope
    if (!admin.district) return NO_USERS;
    if (admin.zone) where.zone = admin.zone;
    where.district = admin.district;
  } else if (admin.accessLevel === "Cluster") {
    // Leave/GPS: next level is ALC — use mapped assemblies when set
    const assemblies = adminAssemblies(admin);
    if (assemblies.length) {
      where.assemblyName = { in: assemblies };
      if (admin.zone) where.zone = admin.zone;
      if (admin.district) where.district = admin.district;
    } else {
      if (!admin.cluster) return NO_USERS;
      if (admin.zone) where.zone = admin.zone;
      if (admin.district) where.district = admin.district;
      where.cluster = admin.cluster;
    }
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
  if (isZoneScopedAdmin(admin.accessLevel)) return Boolean(admin.zone) && user.zone === admin.zone;
  if (admin.accessLevel === "DLC") {
    return Boolean(admin.district) && user.district === admin.district && (!admin.zone || user.zone === admin.zone);
  }
  if (admin.accessLevel === "Cluster") {
    const assemblies = adminAssemblies(admin);
    if (assemblies.length) {
      if (!assemblies.includes(user.assemblyName)) return false;
      if (admin.zone && user.zone !== admin.zone) return false;
      if (admin.district && user.district !== admin.district) return false;
      return true;
    }
    return Boolean(admin.cluster) && (user.cluster || "") === admin.cluster;
  }
  if (admin.accessLevel === "ALC") {
    return Boolean(admin.assemblyName) && user.assemblyName === admin.assemblyName;
  }
  return false;
}
