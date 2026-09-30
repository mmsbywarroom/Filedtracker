import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCallerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadCallForm, rememberQuestionLabels } from "@/lib/callFormStore";

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
    if (k.startsWith("__")) continue;
    if (typeof v === "string") clean[k.slice(0, 80)] = v.slice(0, 500);
  }

  const labels: Record<string, string> = {};
  for (const q of form.questions) labels[q.id] = q.label;
  await rememberQuestionLabels(form.questions);

  const previous = await prisma.callPortalResponse.findMany({
    where: { contactId },
    orderBy: { createdAt: "asc" },
  });
  const merged: Record<string, string> = {};
  const keptLabels: Record<string, string> = {};
  for (const row of previous) {
    const stored = (row.answers as Record<string, unknown>) || {};
    const rowLabels = stored.__labels;
    if (rowLabels && typeof rowLabels === "object") {
      for (const [id, label] of Object.entries(rowLabels as Record<string, unknown>)) {
        if (typeof label === "string") keptLabels[id] = label;
      }
    }
    for (const [k, v] of Object.entries(stored)) {
      if (k === "__labels" || typeof v !== "string") continue;
      merged[k] = v;
    }
  }
  const currentIds = new Set(form.questions.map((q) => q.id));
  for (const id of Array.from(currentIds)) {
    merged[id] = clean[id] || "";
    const textKey = `${id}__text`;
    if (clean[textKey]) merged[textKey] = clean[textKey];
    else delete merged[textKey];
    for (const key of Object.keys(merged)) {
      if (key.startsWith(`${id}__`) && key.endsWith("__text") && !clean[key]) delete merged[key];
    }
  }
  for (const [k, v] of Object.entries(clean)) {
    if (!currentIds.has(k.split("__")[0] || k)) merged[k] = v;
  }
  const payload = { ...merged, __labels: { ...keptLabels, ...labels } };

  const latest = previous[previous.length - 1];
  if (latest) {
    await prisma.callPortalResponse.update({
      where: { id: latest.id },
      data: { callerPhone: s.phone, status, remarks, answers: payload as Prisma.InputJsonValue, createdAt: new Date() },
    });
    const extra = previous.slice(0, -1).map((row) => row.id);
    if (extra.length) await prisma.callPortalResponse.deleteMany({ where: { id: { in: extra } } });
  } else {
    await prisma.callPortalResponse.create({
      data: { contactId, callerPhone: s.phone, status, remarks, answers: payload as Prisma.InputJsonValue },
    });
  }
  return NextResponse.json({ ok: true });
}
