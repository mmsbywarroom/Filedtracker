import { NextResponse } from "next/server";
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
    include: {
      portalResponses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const rows = contacts.map((c) => {
    const last = c.portalResponses[0];
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
      answers: (last?.answers as Record<string, string>) || {},
      updatedAt: last?.createdAt || null,
    };
  });

  const all = q
    ? await prisma.callContact.findMany({
        where: { assigneePhone: s.phone },
        select: { portalResponses: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } } },
      })
    : contacts;

  const statuses = all.map((c) => c.portalResponses[0]?.status || "");
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
