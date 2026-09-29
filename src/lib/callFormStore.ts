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

export async function saveCallForm(form: CallFormShape) {
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
