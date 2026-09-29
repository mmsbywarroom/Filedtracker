import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/security";
import { pickCsv } from "@/lib/rallyUserFields";

const NAME_KEYS = ["Name", "Person Name", "Full Name", "Contact Name"];
const PHONE_KEYS = ["Phone", "Mobile", "Mobile Number", "Number"];
const ASSIGN_KEYS = ["Assigned users", "Assigned Users", "Assign User Mobile", "Assign User", "Assigned User Mobile"];
const ZONE_KEYS = ["Zone"];
const DISTRICT_KEYS = ["District"];
const HALKA_KEYS = ["Halka", "Vidhansabha", "Assembly"];
const VILLAGE_KEYS = ["Village/Ward", "Village Ward", "Village", "Ward"];
const BLOCK_KEYS = ["Block"];
const AGE_KEYS = ["Age"];
const GENDER_KEYS = ["Gender"];
const EDUCATION_KEYS = ["Education"];
const POSITION_KEYS = ["Position"];
const FATHER_KEYS = ["Father Name", "Father"];

export async function importCallCsv(text: string) {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length && !parsed.data.length) {
    return { error: "Could not read CSV." as const };
  }

  const assignPhones = Array.from(
    new Set(parsed.data.map((row) => normalizePhone(pickCsv(row, ASSIGN_KEYS)) || "").filter(Boolean))
  );
  const fieldUsers = assignPhones.length
    ? await prisma.user.findMany({
        where: { phone: { in: assignPhones }, isActive: true },
        select: { id: true, phone: true },
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
    const zone = pickCsv(row, ZONE_KEYS);
    const district = pickCsv(row, DISTRICT_KEYS);
    const halka = pickCsv(row, HALKA_KEYS);
    const villageWard = pickCsv(row, VILLAGE_KEYS);
    const block = pickCsv(row, BLOCK_KEYS);
    const age = pickCsv(row, AGE_KEYS);
    const gender = pickCsv(row, GENDER_KEYS);
    const education = pickCsv(row, EDUCATION_KEYS);
    const position = pickCsv(row, POSITION_KEYS);
    const fatherName = pickCsv(row, FATHER_KEYS);
    const assignRaw = pickCsv(row, ASSIGN_KEYS);
    const assignPhone = assignRaw ? normalizePhone(assignRaw) || "" : "";

    if (!name || !phone) {
      errors.push({ row: i + 2, error: "Name and a valid 10-digit Phone are required." });
      continue;
    }
    if (assignRaw && !assignPhone) {
      errors.push({ row: i + 2, error: "Assigned users must be a 10-digit mobile number." });
      continue;
    }
    if (/^[?？]+$/.test(name.replace(/\s/g, ""))) {
      errors.push({
        row: i + 2,
        error: "Name was lost. In Excel use Save As → CSV UTF-8, then upload again.",
      });
      continue;
    }

    const data = {
      name,
      zone,
      district,
      halka,
      villageWard,
      block,
      age,
      gender,
      education,
      position,
      fatherName,
      assigneePhone: assignPhone,
    };
    const existing = await prisma.callContact.findUnique({ where: { phone } });
    const contact = existing
      ? await prisma.callContact.update({ where: { id: existing.id }, data })
      : await prisma.callContact.create({ data: { ...data, phone } });
    if (existing) updated += 1;
    else created += 1;

    if (!assignPhone) continue;
    assigned += 1;
    const fieldUser = userByPhone.get(assignPhone);
    if (!fieldUser) continue;
    const link = await prisma.callAssignment.findUnique({
      where: { userId_contactId: { userId: fieldUser.id, contactId: contact.id } },
    });
    if (!link) {
      await prisma.callAssignment.create({ data: { userId: fieldUser.id, contactId: contact.id } });
    }
  }

  return { created, updated, assigned, errors };
}

export function decodeCsvBytes(buf: Buffer) {
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

export const CALL_CSV_HEADER =
  "Zone,District,Halka,Village/Ward,Block,Name,Phone,Age,Gender,Education,Position,Father Name,Assigned users\n";
