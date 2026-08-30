import { z } from "zod";

export const rallyUserFields = z.object({
  zone: z.string().min(1).max(80),
  district: z.string().min(1).max(80),
  acName: z.string().min(1).max(80),
  villageWard: z.string().max(80).optional().default(""),
  name: z.string().min(2).max(80),
  phone: z.string().min(8).max(15),
  vehicleNo: z.string().max(40).optional().default(""),
  pocName: z.string().max(80).optional().default(""),
  pocNumber: z.string().max(15).optional().default(""),
  vehicleType: z.string().max(40).optional().default(""),
  rallyId: z.string().min(1),
});

export function pickCsv(row: Record<string, string>, keys: string[]) {
  const map = new Map(Object.keys(row).map((k) => [k.trim().toLowerCase(), k]));
  for (const key of keys) {
    const found = map.get(key.toLowerCase());
    if (found) return String(row[found] || "").trim();
  }
  return "";
}

export const RALLY_CSV_MAP = {
  zone: ["Zone"],
  district: ["District"],
  acName: ["Ac Name", "AC Name", "AcName", "Assembly"],
  villageWard: ["Village/Ward", "Village", "Ward"],
  name: ["User Name", "Name"],
  phone: ["Number", "Phone", "Mobile"],
  vehicleNo: ["Vehicle No", "Vichle No", "Vehicle Number"],
  pocName: ["POC Name", "Poc Name"],
  pocNumber: ["POC Number", "POC Phone", "Poc Number"],
  vehicleType: ["Vehicle Type", "Vichle Type"],
};
