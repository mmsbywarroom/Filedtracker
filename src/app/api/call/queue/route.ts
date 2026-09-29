import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCallerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CONNECTED_CALL_STATUSES, NOT_CONNECTED_CALL_STATUSES } from "@/lib/callList";
import { loadCallForm } from "@/lib/callFormStore";

const REDIAL = new Set(["call_back_later", "call_disconnected", "call_not_received", "switched_off"]);

export async function GET(req: Request) {
  const s = await getCallerSession();
  if (!s?.phone) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.replace(/\D/g, "") || "";

  const contacts = await prisma.callContact.findMany({
    where: {
      assigneePhone: s.phone,
      ...(q ? { phone: { contains: q } } : {}),
    },
    orderBy: [{ halka: "asc" }, { villageWard: "asc" }, { name: "asc" }],
    select: {
      id: true,
      halka: true,
      villageWard: true,
      block: true,
      name: true,
      phone: true,
      age: true,
      gender: true,
      position: true,
      fatherName: true,
    },
  });

  const ids = contacts.map((c) => c.id);
  const latest = ids.length
    ? await prisma.$queryRaw<Array<{ contactId: string; status: string; remarks: string; answers: unknown }>>`
        SELECT DISTINCT ON ("contactId") "contactId", "status", "remarks", "answers"
        FROM "CallPortalResponse"
        WHERE "contactId" IN (${Prisma.join(ids)})
        ORDER BY "contactId", "createdAt" DESC
      `
    : [];
  const byContact = new Map(latest.map((r) => [r.contactId, r]));

  const rows = contacts.map((c) => {
    const last = byContact.get(c.id);
    const answers = last?.answers && typeof last.answers === "object" ? (last.answers as Record<string, string>) : {};
    return {
      id: c.id,
      halka: c.halka,
      villageWard: c.villageWard,
      block: c.block,
      name: c.name,
      phone: c.phone,
      age: c.age,
      gender: c.gender,
      position: c.position,
      fatherName: c.fatherName,
      status: last?.status || "",
      remarks: last?.remarks || "",
      answers,
    };
  });

  const statuses = q
    ? (
        await prisma.$queryRaw<Array<{ status: string }>>`
          SELECT COALESCE(r."status", '') AS status
          FROM "CallContact" c
          LEFT JOIN LATERAL (
            SELECT "status" FROM "CallPortalResponse"
            WHERE "contactId" = c."id"
            ORDER BY "createdAt" DESC
            LIMIT 1
          ) r ON true
          WHERE c."assigneePhone" = ${s.phone}
        `
      ).map((r) => r.status || "")
    : rows.map((r) => r.status);
  const dialed = statuses.filter(Boolean);
  const form = await loadCallForm();

  return NextResponse.json({
    phone: s.phone,
    form,
    contacts: rows,
    stats: {
      total: statuses.length,
      dialed: dialed.length,
      fresh: statuses.filter((s0) => !s0).length,
      redial: dialed.filter((s0) => REDIAL.has(s0)).length,
      connected: dialed.filter((s0) => (CONNECTED_CALL_STATUSES as readonly string[]).includes(s0)).length,
      complete: dialed.filter((s0) => s0 === "call_complete").length,
      notConnected: dialed.filter((s0) => (NOT_CONNECTED_CALL_STATUSES as readonly string[]).includes(s0)).length,
    },
  });
}
