import { NextResponse } from "next/server";
import { getCallAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCallScriptLabel, type CallQuestion } from "@/lib/callForm";
import { loadCallForm } from "@/lib/callFormStore";

const PAGE_SIZE = 50;

function answerText(question: CallQuestion | undefined, answers: Record<string, string>, id: string) {
  const raw = answers[id] || "";
  if (!raw) return "";
  const parts = raw.split("|").filter(Boolean);
  const labels = parts.map((part) => question?.options.find((o) => o.value === part)?.label || part);
  const label = labels.join(", ");
  const extra = [answers[`${id}__text`], ...parts.map((part) => answers[`${id}__${part}__text`])].filter(Boolean).join("; ");
  return extra ? `${label}: ${extra}` : label;
}

export async function GET(req: Request) {
  const s = await getCallAdminSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const page = Math.max(1, Number(new URL(req.url).searchParams.get("page") || 1) || 1);
  const form = await loadCallForm();
  const questionById = new Map(form.questions.map((q) => [q.id, q]));
  const questions = form.questions
    .filter((q) => !isCallScriptLabel(q.label, form))
    .map((q) => ({ id: q.id, label: q.label }));

  const totalRow = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM (
      SELECT "contactId" FROM "CallPortalResponse" GROUP BY "contactId"
    ) grouped
  `;
  const total = Number(totalRow[0]?.n || 0);
  const pageIds = await prisma.$queryRaw<Array<{ contactId: string }>>`
    SELECT "contactId"
    FROM "CallPortalResponse"
    GROUP BY "contactId"
    ORDER BY MAX("createdAt") DESC
    LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
  `;
  const ids = pageIds.map((row) => row.contactId);
  const responses = ids.length
    ? await prisma.callPortalResponse.findMany({
        where: { contactId: { in: ids } },
        orderBy: { createdAt: "desc" },
        include: { contact: true },
      })
    : [];

  const latestByContact = new Map<string, (typeof responses)[number]>();
  for (const row of responses) {
    if (!latestByContact.has(row.contactId)) latestByContact.set(row.contactId, row);
  }

  const rows = ids.flatMap((id) => {
    const row = latestByContact.get(id);
    if (!row) return [];
    const stored = (row.answers as Record<string, unknown>) || {};
    const answers: Record<string, string> = {};
    for (const [key, value] of Object.entries(stored)) {
      if (typeof value === "string") answers[key] = value;
    }
    const c = row.contact;
    return [
      {
        id: row.contactId,
        createdAt: row.createdAt,
        callerPhone: row.callerPhone,
        status: row.status,
        statusLabel: form.statuses.find((st) => st.value === row.status)?.label || row.status,
        remarks: row.remarks,
        halka: c.halka,
        villageWard: c.villageWard,
        name: c.name,
        phone: c.phone,
        age: c.age,
        gender: c.gender,
        position: c.position,
        answers: Object.fromEntries(questions.map((q) => [q.id, answerText(questionById.get(q.id), answers, q.id)])),
      },
    ];
  });

  return NextResponse.json({ questions, rows, page, pageSize: PAGE_SIZE, total });
}
