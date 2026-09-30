import { prisma } from "@/lib/prisma";
import { defaultCallForm, type CallFormShape, type CallQuestion } from "@/lib/callForm";

export async function loadCallForm(): Promise<CallFormShape> {
  const row = await prisma.callForm.findUnique({ where: { id: "active" } });
  if (!row) {
    const d = defaultCallForm();
    await prisma.callForm.create({
      data: {
        id: "active",
        title: d.title,
        openingScript: d.openingScript,
        closingScript: d.closingScript,
        questions: d.questions,
        statuses: d.statuses,
      },
    });
    return d;
  }
  return {
    title: row.title,
    openingScript: row.openingScript,
    closingScript: row.closingScript,
    questions: (row.questions as CallQuestion[]) || [],
    statuses: (row.statuses as CallFormShape["statuses"]) || [],
  };
}

export async function rememberQuestionLabels(questions: { id?: string; label?: string }[]) {
  const row = await prisma.callForm.findUnique({ where: { id: "question-labels" } });
  const prev =
    row?.questions && typeof row.questions === "object" && !Array.isArray(row.questions)
      ? (row.questions as Record<string, unknown>)
      : {};
  const next: Record<string, string> = {};
  for (const [id, label] of Object.entries(prev)) {
    if (typeof label === "string" && label) next[id] = label;
  }
  for (const q of questions) {
    const id = String(q.id || "").slice(0, 80);
    const label = String(q.label || "").slice(0, 500);
    if (id && label) next[id] = label;
  }
  await prisma.callForm.upsert({
    where: { id: "question-labels" },
    create: {
      id: "question-labels",
      title: "Question labels",
      openingScript: "",
      closingScript: "",
      questions: next,
      statuses: [],
    },
    update: { questions: next },
  });
}

export async function loadQuestionLabels(): Promise<Record<string, string>> {
  const row = await prisma.callForm.findUnique({ where: { id: "question-labels" } });
  if (!row?.questions || typeof row.questions !== "object" || Array.isArray(row.questions)) return {};
  const out: Record<string, string> = {};
  for (const [id, label] of Object.entries(row.questions as Record<string, unknown>)) {
    if (typeof label === "string" && label) out[id] = label;
  }
  return out;
}

export async function saveCallForm(form: CallFormShape) {
  const existing = await prisma.callForm.findUnique({ where: { id: "active" } });
  const previous = Array.isArray(existing?.questions) ? (existing.questions as { id?: string; label?: string }[]) : [];
  await rememberQuestionLabels([...previous, ...form.questions]);
  const data = {
    title: form.title.slice(0, 120),
    openingScript: form.openingScript.slice(0, 4000),
    closingScript: form.closingScript.slice(0, 4000),
    questions: form.questions.slice(0, 40),
    statuses: form.statuses.slice(0, 20),
  };
  await prisma.callForm.upsert({
    where: { id: "active" },
    create: { id: "active", ...data },
    update: data,
  });
}
