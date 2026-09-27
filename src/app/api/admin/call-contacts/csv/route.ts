import { NextResponse } from "next/server";
import Papa from "papaparse";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeUser } from "@/lib/hierarchy";
import { normalizePhone } from "@/lib/security";
import { pickCsv } from "@/lib/rallyUserFields";

const NAME_KEYS = ["Person Name", "Name", "User Name"];
const PHONE_KEYS = ["Mobile", "Mobile Number", "Phone", "Number"];
const VEHICLE_KEYS = ["Vehicle Number", "Vehicle No", "Vehicle"];
const ASSIGN_KEYS = ["Assign User Mobile", "Assign User", "Assigned User Mobile", "User Mobile"];

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

  const assignPhones = Array.from(
    new Set(
      parsed.data
        .map((row) => normalizePhone(pickCsv(row, ASSIGN_KEYS)) || "")
        .filter(Boolean)
    )
  );
  const fieldUsers = assignPhones.length
    ? await prisma.user.findMany({
        where: { phone: { in: assignPhones }, isActive: true },
        select: {
          id: true,
          phone: true,
          designation: true,
          zone: true,
          district: true,
          assemblyName: true,
          cluster: true,
        },
      })
    : [];
  const userByPhone = new Map(fieldUsers.map((u) => [u.phone, u]));

  let created = 0;
  let updated = 0;
  let assigned = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const name = pickCsv(row, NAME_KEYS);
    const phone = normalizePhone(pickCsv(row, PHONE_KEYS)) || "";
    const vehicleNumber = pickCsv(row, VEHICLE_KEYS);
    const assignPhone = normalizePhone(pickCsv(row, ASSIGN_KEYS)) || "";
    if (!name || !phone) {
      errors.push({ row: i + 2, error: "Person Name and a valid 10-digit Mobile are required." });
      continue;
    }
    const existing = await prisma.callContact.findUnique({ where: { phone } });
    const contact = existing
      ? await prisma.callContact.update({
          where: { id: existing.id },
          data: { name, vehicleNumber },
        })
      : await prisma.callContact.create({ data: { name, phone, vehicleNumber } });
    if (existing) updated += 1;
    else created += 1;

    if (!assignPhone) continue;
    const fieldUser = userByPhone.get(assignPhone);
    if (!fieldUser || !canSeeUser(s.admin, fieldUser)) {
      errors.push({ row: i + 2, error: `No active field user found for assign mobile ${assignPhone}.` });
      continue;
    }
    const link = await prisma.callAssignment.findUnique({
      where: { userId_contactId: { userId: fieldUser.id, contactId: contact.id } },
    });
    if (!link) {
      await prisma.callAssignment.create({ data: { userId: fieldUser.id, contactId: contact.id } });
      assigned += 1;
    }
  }

  return NextResponse.json({ created, updated, assigned, errors });
}
