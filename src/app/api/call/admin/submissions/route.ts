import { NextResponse } from "next/server";
import { getCallAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loadCallForm } from "@/lib/callFormStore";
import type { CallQuestion } from "@/lib/callForm";

function answerText(question: CallQuestion | undefined, answers: Record<string, string>, id: string) {
  const raw = answers[id] || "";
  if (!question) return raw;
  const option = question.options.find((o) => o.value === raw);
  const label = option?.label || raw;
  const extra = answers[`${id}__text`];
  return extra ? `${label}: ${extra}` : label;
}

export async function GET() {
  const s = await getCallAdminSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await loadCallForm();
  const responses = await prisma.callPortalResponse.findMany({
    orderBy: { createdAt: "desc" },
    take: 2000,
    include: { contact: true },
  });
  const questions = form.questions;
  return NextResponse.json({
    questions: questions.map((q) => ({ id: q.id, label: q.label })),
    statuses: form.statuses,
    rows: responses.map((r) => {
      const answers = (r.answers as Record<string, string>) || {};
      const c = r.contact;
      return {
        id: r.id,
        createdAt: r.createdAt,
        callerPhone: r.callerPhone,
        status: r.status,
        statusLabel: form.statuses.find((st) => st.value === r.status)?.label || r.status,
        remarks: r.remarks,
        zone: c.zone,
        district: c.district,
        halka: c.halka,
        villageWard: c.villageWard,
        block: c.block,
        name: c.name,
        phone: c.phone,
        age: c.age,
        gender: c.gender,
        education: c.education,
        position: c.position,
        fatherName: c.fatherName,
        answers: Object.fromEntries(questions.map((q) => [q.id, answerText(q, answers, q.id)])),
      };
    }),
  });
}
