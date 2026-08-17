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
  if (admin.designations.length) return admin.designations;
  return defaultVisibleDesignations(admin.accessLevel);
}

export function canManageAdmins(admin: Pick<AdminScope, "isSuper" | "accessLevel">) {
  return admin.isSuper || admin.accessLevel === "State";
}

export function userScopeWhere(admin: AdminScope) {
  if (admin.isSuper) return {};
  const where: Record<string, unknown> = {
    designation: { in: visibleDesignationsFor(admin) },
  };
  if (admin.zone) where.zone = admin.zone;
  if (admin.district) where.district = admin.district;
  if (admin.assemblyName) where.assemblyName = admin.assemblyName;
  if (admin.cluster) where.cluster = admin.cluster;
  return where;
}

export function canSeeUser(
  admin: AdminScope,
  user: { designation?: string | null; zone: string; district: string; assemblyName: string; cluster?: string | null }
) {
  if (admin.isSuper) return true;
  const dens = visibleDesignationsFor(admin);
  if (user.designation && !dens.includes(user.designation)) return false;
  if (admin.zone && user.zone !== admin.zone) return false;
  if (admin.district && user.district !== admin.district) return false;
  if (admin.assemblyName && user.assemblyName !== admin.assemblyName) return false;
  if (admin.cluster && (user.cluster || "") !== admin.cluster) return false;
  return true;
}
