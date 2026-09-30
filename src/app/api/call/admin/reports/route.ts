import { NextResponse } from "next/server";
import { getCallAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCallScriptLabel, type CallQuestion } from "@/lib/callForm";
import { loadCallForm } from "@/lib/callFormStore";
import { loadCallOfficeSummary } from "@/lib/callOfficeSummary";

function csvCell(value: unknown) {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  if (/[",]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvResponse(filename: string, body: BodyInit) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function answerText(question: CallQuestion | undefined, answers: Record<string, string>, id: string) {
  const raw = answers[id] || "";
  if (!raw) return "";
  const parts = raw.split("|").filter(Boolean);
  const labels = parts.map((part) => question?.options.find((o) => o.value === part)?.label || part);
  const label = labels.join(", ");
  const extra = [answers[`${id}__text`], ...parts.map((part) => answers[`${id}__${part}__text`])].filter(Boolean).join("; ");
  return extra ? `${label}: ${extra}` : label;
}

async function summaryCsv() {
  const sites = await loadCallOfficeSummary();
  const lines = ["Office,Caller,Assigned,Dialed,Fresh,Connected,Call complete,Not connected,Re-dial"];
  for (const site of sites) {
    lines.push([site.name, `${site.callers} callers`, site.assigned, site.dialed, site.fresh, site.connected, site.complete, site.notConnected, site.redial].map(csvCell).join(","));
    for (const user of site.users) {
      lines.push([site.name, user.name, user.assigned, user.dialed, user.fresh, user.connected, user.complete, user.notConnected, user.redial].map(csvCell).join(","));
    }
  }
  return csvResponse("calling-summary.csv", `\uFEFF${lines.join("\n")}\n`);
}

async function submissionsCsv() {
  const form = await loadCallForm();
  const questions = form.questions.filter((q) => !isCallScriptLabel(q.label, form));
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const header = ["When", "Caller", "Halka", "Village/Ward", "Block", "Name", "Phone", "Age", "Gender", "Position", ...questions.map((q) => q.label), "Call status", "Remarks"];
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`\uFEFF${header.map(csvCell).join(",")}\n`));
      const pageSize = 300;
      let offset = 0;
      for (;;) {
        const pageIds = await prisma.$queryRaw<Array<{ contactId: string }>>`
          SELECT "contactId"
          FROM "CallPortalResponse"
          GROUP BY "contactId"
          ORDER BY MAX("createdAt") DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `;
        if (!pageIds.length) break;
        const ids = pageIds.map((row) => row.contactId);
        const responses = await prisma.callPortalResponse.findMany({
          where: { contactId: { in: ids } },
          orderBy: { createdAt: "desc" },
          include: { contact: true },
        });
        const latest = new Map<string, (typeof responses)[number]>();
        for (const row of responses) {
          if (!latest.has(row.contactId)) latest.set(row.contactId, row);
        }
        let chunk = "";
        for (const id of ids) {
          const row = latest.get(id);
          if (!row?.contact) continue;
          const stored = (row.answers as Record<string, unknown>) || {};
          const answers: Record<string, string> = {};
          for (const [key, value] of Object.entries(stored)) {
            if (typeof value === "string") answers[key] = value;
          }
          const c = row.contact;
          const statusLabel = form.statuses.find((st) => st.value === row.status)?.label || row.status;
          const cells = [
            new Date(row.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
            row.callerPhone,
            c.halka,
            c.villageWard,
            c.block,
            c.name,
            c.phone,
            c.age,
            c.gender,
            c.position,
            ...questions.map((q) => answerText(questionById.get(q.id), answers, q.id)),
            statusLabel,
            row.remarks,
          ];
          chunk += `${cells.map(csvCell).join(",")}\n`;
        }
        controller.enqueue(encoder.encode(chunk));
        offset += pageSize;
        if (pageIds.length < pageSize) break;
      }
      controller.close();
    },
  });
  return csvResponse("calling-submissions.csv", stream);
}

export async function GET(req: Request) {
  const s = await getCallAdminSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kind = new URL(req.url).searchParams.get("kind");
  if (kind === "summary") return summaryCsv();
  if (kind === "submissions") return submissionsCsv();
  return NextResponse.json({ error: "Choose a report." }, { status: 400 });
}
