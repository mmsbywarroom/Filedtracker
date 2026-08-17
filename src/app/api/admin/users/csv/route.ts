import { NextResponse } from "next/server";
import Papa from "papaparse";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/security";
import { CSV_COLUMNS } from "@/lib/utils";
import { isSuperAdmin } from "@/lib/hierarchy";

function pick(row: Record<string, string>, key: string) {
  const found = Object.keys(row).find((k) => k.trim().toLowerCase() === key.toLowerCase());
  return found ? String(row[found] || "").trim() : "";
}

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
    const name = pick(row, CSV_COLUMNS[0]);
    const phoneRaw = pick(row, CSV_COLUMNS[1]);
    const assemblyName = pick(row, CSV_COLUMNS[2]);
    const sectorAllotted = pick(row, CSV_COLUMNS[3]);
    const zone = pick(row, CSV_COLUMNS[4]);
    const district = pick(row, CSV_COLUMNS[5]);
    const designation = pick(row, "Designation") || "Sector Incharge";
    const cluster = pick(row, "Cluster");
    const phone = normalizePhone(phoneRaw);
    if (!name || !phone || !assemblyName || !sectorAllotted || !zone || !district) {
      errors.push({ row: i + 2, error: "Missing or invalid fields" });
      continue;
    }
    const existing = await prisma.user.findUnique({ where: { phone } });
    const data = { name, phone, assemblyName, sectorAllotted, zone, district, designation, cluster };
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data });
      updated.push(phone);
    } else {
      await prisma.user.create({ data });
      created.push(phone);
    }
  }

  return NextResponse.json({ created: created.length, updated: updated.length, errors });
}
