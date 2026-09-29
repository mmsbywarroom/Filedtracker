import { NextResponse } from "next/server";
import { getCallerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadCallForm } from "@/lib/callFormStore";

export async function POST(req: Request) {
  const s = await getCallerSession();
  if (!s?.phone) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const contactId = String(body?.contactId || "");
  const status = String(body?.status || "").trim();
  const remarks = String(body?.remarks || "").slice(0, 2000);
  const answers = body?.answers && typeof body.answers === "object" ? (body.answers as Record<string, string>) : {};
  if (!contactId || !status) return NextResponse.json({ error: "Call status is required." }, { status: 400 });

  const contact = await prisma.callContact.findFirst({
    where: { id: contactId, assigneePhone: s.phone },
    select: { id: true },
  });
  if (!contact) return NextResponse.json({ error: "This contact is not assigned to you." }, { status: 404 });

  const form = await loadCallForm();
  if (!form.statuses.some((st) => st.value === status)) {
    return NextResponse.json({ error: "Choose a call status." }, { status: 400 });
  }

  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers)) {
    if (typeof v === "string") clean[k.slice(0, 80)] = v.slice(0, 500);
  }

  await prisma.callPortalResponse.create({
    data: { contactId, callerPhone: s.phone, status, remarks, answers: clean },
  });
  return NextResponse.json({ ok: true });
}
