import { NextResponse } from "next/server";
import Papa from "papaparse";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeUser } from "@/lib/hierarchy";
import { normalizePhone } from "@/lib/security";
import { pickCsv } from "@/lib/rallyUserFields";

const NAME_KEYS = ["Person Name", "Full Name", "Contact Name", "Name", "User Name"];
const PHONE_KEYS = ["Mobile", "Mobile Number", "Phone", "Number"];
const VEHICLE_KEYS = ["Vehicle Number", "Vehicle No", "Vehicle"];
const ASSIGN_KEYS = ["Assign User Mobile", "Assign User", "Assigned User Mobile", "User Mobile"];
const ZONE_KEYS = ["Zone"];
const DISTRICT_KEYS = ["District"];
const HALKA_KEYS = ["Halka", "Vidhansabha", "Assembly", "AC Name", "Ac Name"];
const VILLAGE_KEYS = ["Village/Ward", "Village Ward", "Village", "Ward"];

export async function POST(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "CSV file required." }, { status: 400 });
  const text = decodeCsvBytes(Buffer.from(await file.arrayBuffer()));
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
    const name = pickCsv(row, NAME_KEYS).replace(/\u0000/g, "").trim();
    const phone = normalizePhone(pickCsv(row, PHONE_KEYS)) || "";
    const vehicleNumber = pickCsv(row, VEHICLE_KEYS);
    const zone = pickCsv(row, ZONE_KEYS);
    const district = pickCsv(row, DISTRICT_KEYS);
    const halka = pickCsv(row, HALKA_KEYS);
    const villageWard = pickCsv(row, VILLAGE_KEYS);
    const assignPhone = normalizePhone(pickCsv(row, ASSIGN_KEYS)) || "";
    if (!name || !phone) {
      errors.push({ row: i + 2, error: "Person Name and a valid 10-digit Mobile are required." });
      continue;
    }
    if (/^[?？]+$/.test(name.replace(/\s/g, ""))) {
      errors.push({
        row: i + 2,
        error: "Person name was lost. In Excel use Save As → CSV UTF-8, then upload again.",
      });
      continue;
    }
    const existing = await prisma.callContact.findUnique({ where: { phone } });
    const contact = existing
      ? await prisma.callContact.update({
          where: { id: existing.id },
          data: { name, vehicleNumber, zone, district, halka, villageWard },
        })
      : await prisma.callContact.create({ data: { name, phone, vehicleNumber, zone, district, halka, villageWard } });
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

function decodeCsvBytes(buf: Buffer) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString("utf16le").replace(/^\uFEFF/, "");
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.alloc(Math.max(0, buf.length - 2));
    for (let i = 2; i + 1 < buf.length; i += 2) {
      swapped[i - 2] = buf[i + 1];
      swapped[i - 1] = buf[i];
    }
    return swapped.toString("utf16le").replace(/^\uFEFF/, "");
  }
  const sample = buf.subarray(0, Math.min(buf.length, 400));
  let nulls = 0;
  for (let i = 1; i < sample.length; i += 2) if (sample[i] === 0) nulls += 1;
  if (sample.length > 8 && nulls > sample.length / 5) {
    return buf.toString("utf16le").replace(/^\uFEFF/, "");
  }
  return buf.toString("utf8").replace(/^\uFEFF/, "");
}
