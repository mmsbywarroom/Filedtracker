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

/** Field users a DLC/Cluster admin sees under mapped assemblies (ALC/SI only) */
export const ASSEMBLY_SCOPED_DESIGNATIONS = ["ALC", "Sector Incharge"] as const;

/** What Zone Coordinator / ZLC admins see on Users + Dashboard */
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

/** Matches zero rows; uses AND so it never clashes with a top-level `id` filter. */
const NO_USERS = { AND: [{ id: "__none__" }] };

/** Treat placeholder values like NA as empty so they don't break filters */
export function cleanScope(v?: string | null): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (["na", "n/a", "n.a.", "n.a", "-", "--", "none", "null", "nil", "undefined"].includes(lower)) {
    return "";
  }
  return s;
}

export function isZoneScopedAdmin(level: string) {
  return level === "ZLC" || level === "Zone Coordinator";
}

export function designationsBelow(level: string): string[] {
  const rank = DESIGNATION_RANK[level] ?? 99;
  return DESIGNATIONS.filter((d) => DESIGNATION_RANK[d] > rank);
}

/**
 * Designations each admin level sees on Users + Dashboard (hierarchy, not checkboxes).
 * State → all | ZLC/Zone Coord → DLC..SI | DLC → Cluster..SI | Cluster → ALC,SI | ALC → SI
 */
export function defaultVisibleDesignations(level: string): string[] {
  if (level === "State") return [...DESIGNATIONS];
  if (isZoneScopedAdmin(level)) return [...ZONE_SCOPED_DESIGNATIONS];
  if (level === "DLC") return designationsBelow("DLC"); // Cluster, ALC, Sector Incharge
  if (level === "Cluster") return [...ASSEMBLY_SCOPED_DESIGNATIONS];
  if (level === "ALC") return ["Sector Incharge"];
  return designationsBelow(level);
}

/** Users/Dashboard scope always follows accessLevel hierarchy (ignores stale checkbox lists). */
export function visibleDesignationsFor(admin: Pick<AdminScope, "isSuper" | "accessLevel" | "designations">): string[] {
  if (admin.isSuper) return [...DESIGNATIONS];
  if (admin.accessLevel === "State") return [...DESIGNATIONS];
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
  const fromArr = (admin.assemblies || []).map((a) => cleanScope(a)).filter(Boolean);
  if (fromArr.length) return Array.from(new Set(fromArr));
  const raw = cleanScope(admin.assemblyName);
  if (!raw) return [];
  if (/[|;,]/.test(String(admin.assemblyName || ""))) {
    return Array.from(
      new Set(
        String(admin.assemblyName || "")
          .split(/[|;,]/)
          .map((a) => cleanScope(a))
          .filter(Boolean)
      )
    );
  }
  if (admin.accessLevel === "ALC" && raw) return [raw];
  return [];
}

export function parseAssembliesInput(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((a) => cleanScope(String(a || ""))).filter(Boolean)));
  }
  if (typeof raw === "string") {
    return Array.from(new Set(raw.split(/[|;,]/).map((a) => cleanScope(a)).filter(Boolean)));
  }
  return [];
}

function assemblyNameFilter(assemblies: string[]) {
  if (assemblies.length === 1) {
    return { assemblyName: { equals: assemblies[0], mode: "insensitive" as const } };
  }
  return {
    OR: assemblies.map((name) => ({
      assemblyName: { equals: name, mode: "insensitive" as const },
    })),
  };
}

/**
 * Users + Dashboard filter by hierarchy.
 * State = whole state
 * ZLC / Zone Coordinator = DLC+Cluster+ALC+SI in their zone
 * DLC = Cluster+ALC+SI in district (ALC/SI limited to mapped assemblies when set)
 * Cluster = ALC+SI in mapped assemblies or cluster
 * ALC = Sector Incharge in assembly
 */
export function userScopeWhere(admin: AdminScope) {
  if (admin.isSuper) return {};
  if (admin.accessLevel === "State") return {};

  const dens = visibleDesignationsFor(admin);
  if (!dens.length) return NO_USERS;

  const zone = cleanScope(admin.zone);
  const district = cleanScope(admin.district);
  const cluster = cleanScope(admin.cluster);
  const assembly = cleanScope(admin.assemblyName);
  const assemblies = adminAssemblies(admin);

  if (isZoneScopedAdmin(admin.accessLevel)) {
    if (!zone) return NO_USERS;
    return {
      designation: { in: dens },
      zone: { equals: zone, mode: "insensitive" as const },
    };
  }

  if (admin.accessLevel === "DLC") {
    if (!district && !assemblies.length) return NO_USERS;

    if (assemblies.length && !district) {
      // District missing/NA but assemblies mapped — use assemblies only
      return {
        designation: { in: dens },
        ...assemblyNameFilter(assemblies),
      };
    }

    const base: Record<string, unknown> = {
      district: { equals: district, mode: "insensitive" as const },
    };
    if (zone) base.zone = { equals: zone, mode: "insensitive" as const };

    if (assemblies.length) {
      return {
        ...base,
        OR: [
          { designation: "Cluster" },
          {
            AND: [{ designation: { in: ["ALC", "Sector Incharge"] } }, assemblyNameFilter(assemblies)],
          },
        ],
      };
    }
    return {
      ...base,
      designation: { in: dens },
    };
  }

  if (admin.accessLevel === "Cluster") {
    if (assemblies.length) {
      // Mapped assemblies are the source of truth — do NOT also require zone/district
      // (many Cluster admins have placeholder NA in those fields)
      return {
        designation: { in: dens },
        ...assemblyNameFilter(assemblies),
      };
    }
    if (!cluster) return NO_USERS;
    const where: Record<string, unknown> = {
      designation: { in: dens },
      cluster: { equals: cluster, mode: "insensitive" as const },
    };
    if (zone) where.zone = { equals: zone, mode: "insensitive" as const };
    if (district) where.district = { equals: district, mode: "insensitive" as const };
    return where;
  }

  if (admin.accessLevel === "ALC") {
    if (!assembly) return NO_USERS;
    const where: Record<string, unknown> = {
      designation: { in: dens },
      assemblyName: { equals: assembly, mode: "insensitive" as const },
    };
    if (zone) where.zone = { equals: zone, mode: "insensitive" as const };
    if (district) where.district = { equals: district, mode: "insensitive" as const };
    return where;
  }

  return NO_USERS;
}

export function canSeeUser(
  admin: AdminScope,
  user: { designation?: string | null; zone: string; district: string; assemblyName: string; cluster?: string | null }
) {
  if (admin.isSuper) return true;
  if (admin.accessLevel === "State") return true;

  const dens = visibleDesignationsFor(admin);
  const des = user.designation || "";
  if (!dens.includes(des)) return false;

  const zone = cleanScope(admin.zone);
  const district = cleanScope(admin.district);
  const cluster = cleanScope(admin.cluster);
  const assembly = cleanScope(admin.assemblyName);
  const assemblies = adminAssemblies(admin);
  const userAssembly = (user.assemblyName || "").trim().toLowerCase();

  if (isZoneScopedAdmin(admin.accessLevel)) {
    return Boolean(zone) && user.zone.trim().toLowerCase() === zone.toLowerCase();
  }

  if (admin.accessLevel === "DLC") {
    if (assemblies.length && !district) {
      return assemblies.some((a) => a.toLowerCase() === userAssembly);
    }
    if (!district || user.district.trim().toLowerCase() !== district.toLowerCase()) return false;
    if (zone && user.zone.trim().toLowerCase() !== zone.toLowerCase()) return false;
    if (!assemblies.length) return true;
    if (des === "Cluster") return true;
    return assemblies.some((a) => a.toLowerCase() === userAssembly);
  }

  if (admin.accessLevel === "Cluster") {
    if (assemblies.length) return assemblies.some((a) => a.toLowerCase() === userAssembly);
    return Boolean(cluster) && (user.cluster || "").trim().toLowerCase() === cluster.toLowerCase();
  }

  if (admin.accessLevel === "ALC") {
    return Boolean(assembly) && userAssembly === assembly.toLowerCase();
  }

  return false;
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
    const zone = cleanScope(admin.zone);
    if (!zone) return NO_USERS;
    where.zone = { equals: zone, mode: "insensitive" as const };
  } else if (admin.accessLevel === "DLC") {
    // Leave/GPS: next level is Cluster — keep district scope
    const district = cleanScope(admin.district);
    if (!district) return NO_USERS;
    where.district = { equals: district, mode: "insensitive" as const };
    const zone = cleanScope(admin.zone);
    if (zone) where.zone = { equals: zone, mode: "insensitive" as const };
  } else if (admin.accessLevel === "Cluster") {
    // Leave/GPS: next level is ALC — use mapped assemblies when set
    const assemblies = adminAssemblies(admin);
    if (assemblies.length) {
      return {
        designation: next,
        OR: assemblies.map((name) => ({
          assemblyName: { equals: name, mode: "insensitive" as const },
        })),
      };
    }
    const cluster = cleanScope(admin.cluster);
    if (!cluster) return NO_USERS;
    const where: Record<string, unknown> = {
      designation: next,
      cluster: { equals: cluster, mode: "insensitive" as const },
    };
    const zone = cleanScope(admin.zone);
    const district = cleanScope(admin.district);
    if (zone) where.zone = { equals: zone, mode: "insensitive" as const };
    if (district) where.district = { equals: district, mode: "insensitive" as const };
    return where;
  } else if (admin.accessLevel === "ALC") {
    const assembly = cleanScope(admin.assemblyName);
    if (!assembly) return NO_USERS;
    const where: Record<string, unknown> = {
      designation: next,
      assemblyName: { equals: assembly, mode: "insensitive" as const },
    };
    const zone = cleanScope(admin.zone);
    const district = cleanScope(admin.district);
    if (zone) where.zone = { equals: zone, mode: "insensitive" as const };
    if (district) where.district = { equals: district, mode: "insensitive" as const };
    return where;
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
  if (isZoneScopedAdmin(admin.accessLevel)) {
    const zone = cleanScope(admin.zone);
    return Boolean(zone) && user.zone.trim().toLowerCase() === zone.toLowerCase();
  }
  if (admin.accessLevel === "DLC") {
    const district = cleanScope(admin.district);
    return Boolean(district) && user.district.trim().toLowerCase() === district.toLowerCase();
  }
  if (admin.accessLevel === "Cluster") {
    const assemblies = adminAssemblies(admin);
    if (assemblies.length) {
      const userAssembly = (user.assemblyName || "").trim().toLowerCase();
      return assemblies.some((a) => a.toLowerCase() === userAssembly);
    }
    const cluster = cleanScope(admin.cluster);
    return Boolean(cluster) && (user.cluster || "").trim().toLowerCase() === cluster.toLowerCase();
  }
  if (admin.accessLevel === "ALC") {
    const assembly = cleanScope(admin.assemblyName);
    return Boolean(assembly) && user.assemblyName.trim().toLowerCase() === assembly.toLowerCase();
  }
  return false;
}
