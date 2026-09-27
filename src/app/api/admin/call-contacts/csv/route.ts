import { NextResponse } from "next/server";
import Papa from "papaparse";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/security";
import { pickCsv } from "@/lib/rallyUserFields";

const NAME_KEYS = ["Person Name", "Name", "User Name"];
const PHONE_KEYS = ["Mobile", "Mobile Number", "Phone", "Number"];
const VEHICLE_KEYS = ["Vehicle Number", "Vehicle No", "Vehicle"];

export async function POST(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "CSV file required." }, { status: 400 });
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length && !parsed.data.length) {
    return NextResponse.json({ error: "Could not read CSV." }, { status: 400 });
  }

  let created = 0;
  let updated = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const name = pickCsv(row, NAME_KEYS);
    const phone = normalizePhone(pickCsv(row, PHONE_KEYS)) || "";
    const vehicleNumber = pickCsv(row, VEHICLE_KEYS);
    if (!name || !phone) {
      errors.push({ row: i + 2, error: "Person Name and a valid 10-digit Mobile are required." });
      continue;
    }
    const existing = await prisma.callContact.findUnique({ where: { phone } });
    if (existing) {
      await prisma.callContact.update({
        where: { id: existing.id },
        data: { name, vehicleNumber },
      });
      updated += 1;
    } else {
      await prisma.callContact.create({ data: { name, phone, vehicleNumber } });
      created += 1;
    }
  }

  return NextResponse.json({ created, updated, errors });
}
