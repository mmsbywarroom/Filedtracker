import { NextResponse } from "next/server";
import Papa from "papaparse";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/security";
import { DESIGNATIONS, isSuperAdmin, parseAssembliesInput } from "@/lib/hierarchy";
import { normalizeUserAssemblies } from "@/lib/userAssemblies";
import { pickUserCsv, USER_CSV_ALIASES } from "@/lib/userCsvFields";

export async function POST(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(s.admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "CSV file required." }, { status: 400 });
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length && !parsed.data.length) {
    return NextResponse.json({ error: "Could not read CSV." }, { status: 400 });
  }

  const created: string[] = [];
  const updated: string[] = [];
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const name = pickUserCsv(row, USER_CSV_ALIASES.name);
    const phoneRaw = pickUserCsv(row, USER_CSV_ALIASES.phone);
    const assemblyName = pickUserCsv(row, USER_CSV_ALIASES.assemblyName);
    const sectorAllotted = pickUserCsv(row, USER_CSV_ALIASES.sectorAllotted);
    const zone = pickUserCsv(row, USER_CSV_ALIASES.zone);
    const district = pickUserCsv(row, USER_CSV_ALIASES.district);
    const designation = pickUserCsv(row, USER_CSV_ALIASES.designation) || "Sector Incharge";
    if (!DESIGNATIONS.includes(designation as (typeof DESIGNATIONS)[number])) {
      errors.push({ row: i + 2, error: `Invalid designation "${designation}"` });
      continue;
    }
    const cluster = pickUserCsv(row, USER_CSV_ALIASES.cluster);
    const assembliesRaw =
      pickUserCsv(row, USER_CSV_ALIASES.assemblies) ||
      pickUserCsv(row, ["Mapped Assemblies"]);
    const { assemblyName: asm, assemblies } = normalizeUserAssemblies(
      designation,
      assemblyName,
      assembliesRaw ? parseAssembliesInput(assembliesRaw) : undefined
    );
    const phone = normalizePhone(phoneRaw);
    const missing: string[] = [];
    if (!name) missing.push("Name");
    if (!phone) missing.push(phoneRaw ? "Phone (invalid)" : "Phone");
    if (!asm) missing.push("Assembly");
    if (!sectorAllotted) missing.push("Sector allotted");
    if (!zone) missing.push("Zone");
    if (!district) missing.push("District");
    if (missing.length || !phone) {
      errors.push({
        row: i + 2,
        error: `Missing or invalid: ${missing.join(", ") || "Phone"}${phoneRaw || name ? ` (${[name, phoneRaw].filter(Boolean).join(" · ")})` : ""}`,
      });
      continue;
    }
    if (designation === "ALC" && assemblies.length < 1) {
      errors.push({
        row: i + 2,
        error: `ALC needs Assembly Name or Assemblies column (${name || phone})`,
      });
      continue;
    }
    const data = { name, phone, assemblyName: asm, assemblies, sectorAllotted, zone, district, designation, cluster };
    try {
      const existing = await prisma.user.findUnique({ where: { phone } });
      if (existing) {
        await prisma.user.update({ where: { id: existing.id }, data });
        updated.push(phone);
      } else {
        await prisma.user.create({ data });
        created.push(phone);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not save row";
      errors.push({ row: i + 2, error: `${msg} (${name} · ${phone})` });
    }
  }

  return NextResponse.json({ created: created.length, updated: updated.length, errors });
}
