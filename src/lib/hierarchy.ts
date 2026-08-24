export const DESIGNATIONS = [
  "State",
  "Zone Coordinator",
  "ZLC",
  "DLC",
  "Cluster",
  "ALC",
  "Sector Incharge",
  "Call Center",
] as const;

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

/** What ZLC admins see on Users + Dashboard (zone juniors) */
export const ZONE_SCOPED_DESIGNATIONS = ["DLC", "Cluster", "ALC", "Sector Incharge"] as const;

/** Zone Coordinator sees only field workers under the zone */
export const ZONE_COORDINATOR_DESIGNATIONS = ["ALC", "Sector Incharge"] as const;

/** State reviews both zone-level field designations */
export const ZONE_LEVEL_DESIGNATIONS = ["Zone Coordinator", "ZLC"] as const;

/** Not in party hierarchy — only Super admin and State-level admins can see these field users */
export const SUPER_ONLY_DESIGNATIONS = ["Call Center"] as const;

export function isSuperOnlyDesignation(d?: string | null) {
  return SUPER_ONLY_DESIGNATIONS.includes((d || "") as (typeof SUPER_ONLY_DESIGNATIONS)[number]);
}

export function canSeeCallCenterUsers(admin: Pick<AdminScope, "isSuper" | "accessLevel">) {
  return Boolean(admin.isSuper) || normalizeAccessLevel(admin.accessLevel) === "State";
}

export function hierarchyDesignations(): string[] {
  return DESIGNATIONS.filter((d) => !isSuperOnlyDesignation(d));
}

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
  const n = normalizeAccessLevel(level);
  return n === "ZLC" || n === "Zone Coordinator";
}

/** Normalize legacy / CSV variants so scope matching never fails silently. */
export function normalizeAccessLevel(level: string): string {
  const s = String(level || "").trim();
  if (!s) return s;
  const lower = s.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (lower === "zone coordinator" || lower === "zone co ordinator" || lower === "zc" || lower === "zone coord") {
    return "Zone Coordinator";
  }
  if (lower === "zlc") return "ZLC";
  if (lower === "dlc") return "DLC";
  if (lower === "alc") return "ALC";
  if (lower === "cluster") return "Cluster";
  if (lower === "state") return "State";
  return s;
}

export function designationsBelow(level: string): string[] {
  const rank = DESIGNATION_RANK[level] ?? 99;
  return hierarchyDesignations().filter((d) => DESIGNATION_RANK[d] > rank);
}

/**
 * Designations each admin level sees on Users + Dashboard (hierarchy, not checkboxes).
 * State → hierarchy + Call Center | Zone Coord → ALC,SI | ZLC → DLC..SI | DLC → Cluster..SI | Cluster → ALC,SI | ALC → SI
 * Call Center is not under anyone — Super admin and State admins only.
 */
export function defaultVisibleDesignations(level: string): string[] {
  const n = normalizeAccessLevel(level);
  if (n === "State") return [...DESIGNATIONS];
  if (n === "Zone Coordinator") return [...ZONE_COORDINATOR_DESIGNATIONS];
  if (n === "ZLC") return [...ZONE_SCOPED_DESIGNATIONS];
  if (n === "DLC") return designationsBelow("DLC"); // Cluster, ALC, Sector Incharge
  if (n === "Cluster") return [...ASSEMBLY_SCOPED_DESIGNATIONS];
  if (n === "ALC") return ["Sector Incharge"];
  return designationsBelow(n);
}

/** Users/Dashboard scope always follows accessLevel hierarchy (ignores stale checkbox lists). */
export function visibleDesignationsFor(admin: Pick<AdminScope, "isSuper" | "accessLevel" | "designations">): string[] {
  if (admin.isSuper) return [...DESIGNATIONS];
  const level = normalizeAccessLevel(admin.accessLevel);
  if (level === "State") return [...DESIGNATIONS];
  // Zone Coordinator: only ALC + Sector Incharge (ignore stale DLC/Cluster checkboxes)
  if (level === "Zone Coordinator") return [...ZONE_COORDINATOR_DESIGNATIONS];
  return defaultVisibleDesignations(level);
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
 * ZLC = DLC+Cluster+ALC+SI in their zone
 * Zone Coordinator = ALC+SI in their zone
 * DLC = Cluster+ALC+SI in district (ALC/SI limited to mapped assemblies when set)
 * Cluster = ALC+SI in mapped assemblies or cluster
 * ALC = Sector Incharge in assembly
 */
export function userScopeWhere(admin: AdminScope) {
  if (admin.isSuper) return {};
  const level = normalizeAccessLevel(admin.accessLevel);
  if (level === "State") return {};

  const dens = visibleDesignationsFor({ ...admin, accessLevel: level });
  if (!dens.length) return NO_USERS;

  const zone = cleanScope(admin.zone);
  const district = cleanScope(admin.district);
  const cluster = cleanScope(admin.cluster);
  const assembly = cleanScope(admin.assemblyName);
  const assemblies = adminAssemblies(admin);

  if (isZoneScopedAdmin(level)) {
    // Zone Coordinator → ALC + Sector Incharge; ZLC → DLC + Cluster + ALC + SI
    if (zone) {
      return {
        designation: { in: dens },
        zone: { equals: zone, mode: "insensitive" as const },
      };
    }
    // Zone missing/NA but assemblies mapped — still show ALC/SI in those assemblies
    if (assemblies.length) {
      return {
        designation: { in: dens },
        ...assemblyNameFilter(assemblies),
      };
    }
    return NO_USERS;
  }

  if (level === "DLC") {
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

  if (level === "Cluster") {
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

  if (level === "ALC") {
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
  if (isSuperOnlyDesignation(user.designation) && !canSeeCallCenterUsers(admin)) return false;
  if (admin.accessLevel === "State") return true;

  const dens = visibleDesignationsFor(admin);
  const des = user.designation || "";
  if (!dens.includes(des)) return false;

  const level = normalizeAccessLevel(admin.accessLevel);
  const zone = cleanScope(admin.zone);
  const district = cleanScope(admin.district);
  const cluster = cleanScope(admin.cluster);
  const assembly = cleanScope(admin.assemblyName);
  const assemblies = adminAssemblies(admin);
  const userAssembly = (user.assemblyName || "").trim().toLowerCase();

  if (isZoneScopedAdmin(level)) {
    if (zone) return user.zone.trim().toLowerCase() === zone.toLowerCase();
    if (assemblies.length) return assemblies.some((a) => a.toLowerCase() === userAssembly);
    return false;
  }

  if (level === "DLC") {
    if (assemblies.length && !district) {
      return assemblies.some((a) => a.toLowerCase() === userAssembly);
    }
    if (!district || user.district.trim().toLowerCase() !== district.toLowerCase()) return false;
    if (zone && user.zone.trim().toLowerCase() !== zone.toLowerCase()) return false;
    if (!assemblies.length) return true;
    if (des === "Cluster") return true;
    return assemblies.some((a) => a.toLowerCase() === userAssembly);
  }

  if (level === "Cluster") {
    if (assemblies.length) return assemblies.some((a) => a.toLowerCase() === userAssembly);
    return Boolean(cluster) && (user.cluster || "").trim().toLowerCase() === cluster.toLowerCase();
  }

  if (level === "ALC") {
    return Boolean(assembly) && userAssembly === assembly.toLowerCase();
  }

  return false;
}

/** Immediate junior designation(s):
 * State→Zone Coordinator/ZLC→DLC→Cluster→ALC→Sector Incharge
 */
export function leaveReviewDesignations(level: string): string[] {
  const n = normalizeAccessLevel(level);
  if (n === "State") return [...ZONE_LEVEL_DESIGNATIONS];
  if (isZoneScopedAdmin(n)) return ["DLC"];
  const rank = DESIGNATION_RANK[n];
  if (rank == null) return [];
  const next = DESIGNATIONS.find((d) => DESIGNATION_RANK[d] === rank + 1);
  return next ? [next] : [];
}

export function leaveReviewDesignation(level: string): string | null {
  return leaveReviewDesignations(level)[0] || null;
}

function designationFilter(next: string[]) {
  if (next.length === 1) return { designation: next[0] };
  return { designation: { in: next } };
}

/** Same geography as users, but only the next designation down (leave + GPS-off). */
export function nextLevelScopeWhere(admin: AdminScope) {
  if (admin.isSuper) return {};
  const level = normalizeAccessLevel(admin.accessLevel);
  const next = leaveReviewDesignations(level);
  if (!next.length) return NO_USERS;
  const where: Record<string, unknown> = { ...designationFilter(next) };
  if (isZoneScopedAdmin(level)) {
    const zone = cleanScope(admin.zone);
    if (!zone) return NO_USERS;
    where.zone = { equals: zone, mode: "insensitive" as const };
  } else if (level === "DLC") {
    // Leave/GPS: next level is Cluster — keep district scope
    const district = cleanScope(admin.district);
    if (!district) return NO_USERS;
    where.district = { equals: district, mode: "insensitive" as const };
    const zone = cleanScope(admin.zone);
    if (zone) where.zone = { equals: zone, mode: "insensitive" as const };
  } else if (level === "Cluster") {
    // Leave/GPS: next level is ALC — use mapped assemblies when set
    const assemblies = adminAssemblies(admin);
    if (assemblies.length) {
      return {
        ...designationFilter(next),
        OR: assemblies.map((name) => ({
          assemblyName: { equals: name, mode: "insensitive" as const },
        })),
      };
    }
    const cluster = cleanScope(admin.cluster);
    if (!cluster) return NO_USERS;
    const scoped: Record<string, unknown> = {
      ...designationFilter(next),
      cluster: { equals: cluster, mode: "insensitive" as const },
    };
    const zone = cleanScope(admin.zone);
    const district = cleanScope(admin.district);
    if (zone) scoped.zone = { equals: zone, mode: "insensitive" as const };
    if (district) scoped.district = { equals: district, mode: "insensitive" as const };
    return scoped;
  } else if (level === "ALC") {
    const assembly = cleanScope(admin.assemblyName);
    if (!assembly) return NO_USERS;
    const scoped: Record<string, unknown> = {
      ...designationFilter(next),
      assemblyName: { equals: assembly, mode: "insensitive" as const },
    };
    const zone = cleanScope(admin.zone);
    const district = cleanScope(admin.district);
    if (zone) scoped.zone = { equals: zone, mode: "insensitive" as const };
    if (district) scoped.district = { equals: district, mode: "insensitive" as const };
    return scoped;
  } else if (level === "State") {
    // statewide — Zone Coordinator + ZLC
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
  const next = leaveReviewDesignations(admin.accessLevel);
  if (!next.length || !next.includes(user.designation || "")) return false;
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
