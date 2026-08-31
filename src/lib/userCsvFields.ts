import { CSV_COLUMNS } from "@/lib/utils";

/** Accept template headers and common Excel exports (no spaces, merged names). */
export const USER_CSV_ALIASES = {
  name: [CSV_COLUMNS[0], "SectorInchargeName", "Name", "User Name"],
  phone: [CSV_COLUMNS[1], "SectorInchargeNumber", "Phone", "Mobile", "Mobile Number", "Number"],
  assemblyName: [CSV_COLUMNS[2], "AssemblyName", "Assembly"],
  sectorAllotted: [CSV_COLUMNS[3], "SectorAllotted", "Sector"],
  zone: [CSV_COLUMNS[4]],
  district: [CSV_COLUMNS[5]],
  designation: ["Designation"],
  cluster: ["Cluster"],
  assemblies: ["Assemblies", "Mapped Assemblies"],
} as const;

export function pickUserCsv(row: Record<string, string>, keys: readonly string[]) {
  const map = new Map(
    Object.keys(row).map((k) => [k.replace(/^\uFEFF/, "").trim().toLowerCase(), k])
  );
  for (const key of keys) {
    const found = map.get(key.toLowerCase());
    if (found) return String(row[found] ?? "").trim();
  }
  return "";
}
