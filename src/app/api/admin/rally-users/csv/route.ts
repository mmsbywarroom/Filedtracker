import { NextResponse } from "next/server";
import Papa from "papaparse";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/security";
import { pickCsv, RALLY_CSV_MAP } from "@/lib/rallyUserFields";

export async function POST(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const rallyId = String(form.get("rallyId") || "").trim();
  if (!(file instanceof File)) return NextResponse.json({ error: "CSV file required." }, { status: 400 });
  if (!rallyId) return NextResponse.json({ error: "Create or select a rally first." }, { status: 400 });
  const rally = await prisma.rally.findUnique({ where: { id: rallyId } });
  if (!rally) return NextResponse.json({ error: "Rally not found." }, { status: 404 });

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length && !parsed.data.length) {
    return NextResponse.json({ error: "Could not read CSV." }, { status: 400 });
  }

  const created: string[] = [];
  const updated: string[] = [];
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const name = pickCsv(row, RALLY_CSV_MAP.name);
    const phoneRaw = pickCsv(row, RALLY_CSV_MAP.phone);
    const phone = normalizePhone(phoneRaw) || "";
    const zone = pickCsv(row, RALLY_CSV_MAP.zone);
    const district = pickCsv(row, RALLY_CSV_MAP.district);
    const acName = pickCsv(row, RALLY_CSV_MAP.acName);
    const villageWard = pickCsv(row, RALLY_CSV_MAP.villageWard);
    const vehicleNo = pickCsv(row, RALLY_CSV_MAP.vehicleNo);
    const pocName = pickCsv(row, RALLY_CSV_MAP.pocName);
    const pocRaw = pickCsv(row, RALLY_CSV_MAP.pocNumber);
    const pocNumber = normalizePhone(pocRaw) || pocRaw;
    const vehicleType = pickCsv(row, RALLY_CSV_MAP.vehicleType);
    const missing: string[] = [];
    if (!name) missing.push("User Name");
    if (!phone) missing.push("Number");
    if (!zone) missing.push("Zone");
    if (!district) missing.push("District");
    if (!acName) missing.push("Ac Name");
    if (missing.length) {
      errors.push({ row: i + 2, error: `Missing: ${missing.join(", ")}` });
      continue;
    }
    const fieldClash = await prisma.user.findUnique({ where: { phone } });
    if (fieldClash) {
      errors.push({ row: i + 2, error: `${phone} is already a field attendance user` });
      continue;
    }
    const data = { rallyId, name, phone, zone, district, acName, villageWard, vehicleNo, pocName, pocNumber, vehicleType };
    try {
      const existing = await prisma.rallyUser.findUnique({ where: { phone } });
      if (existing) {
        await prisma.rallyUser.update({ where: { id: existing.id }, data });
        updated.push(phone);
      } else {
        await prisma.rallyUser.create({ data });
        created.push(phone);
      }
    } catch {
      errors.push({ row: i + 2, error: `Could not save ${name} (${phone})` });
    }
  }

  return NextResponse.json({ created: created.length, updated: updated.length, errors });
}
