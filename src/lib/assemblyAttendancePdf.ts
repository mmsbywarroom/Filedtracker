import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { assemblyExportFileName } from "@/lib/assemblyHalkaCodes";
import type { AttendanceExportRow } from "@/lib/assemblyAttendanceZip";

type Summary = {
  present: number;
  halfDay: number;
  pending: number;
  absent: number;
  leave: number;
  total: number;
};

function computeSummary(rows: AttendanceExportRow[]): Summary {
  const s: Summary = { present: 0, halfDay: 0, pending: 0, absent: 0, leave: 0, total: rows.length };
  for (const r of rows) {
    if (r.status === "present") s.present += 1;
    else if (r.status === "half_day") s.halfDay += 1;
    else if (r.status === "leave") s.leave += 1;
    else if (r.status === "pending") s.pending += 1;
    else s.absent += 1;
  }
  return s;
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtDate(date: string) {
  return new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function rowStatusLabel(status: string, label: string) {
  if (label) return label;
  if (status === "half_day") return "Half-day";
  if (status === "pending") return "Pending punch-in";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function drawSummaryCards(doc: jsPDF, summary: Summary, startY: number) {
  const cards: { label: string; value: number; color: [number, number, number]; sub?: string }[] = [
    { label: "Present", value: summary.present, color: [5, 150, 105] },
    { label: "Half-day", value: summary.halfDay, color: [245, 158, 11] },
    { label: "Pending", value: summary.pending, color: [249, 115, 22] },
    { label: "Absent", value: summary.absent, color: [220, 38, 38], sub: "After 1:00 PM" },
    { label: "Leave", value: summary.leave, color: [2, 132, 199] },
    { label: "Total", value: summary.total, color: [15, 23, 42] },
  ];

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const gap = 4;
  const cardW = (pageW - margin * 2 - gap * 5) / 6;
  const cardH = 22;
  let x = margin;

  for (const card of cards) {
    doc.setFillColor(card.color[0], card.color[1], card.color[2]);
    doc.roundedRect(x, startY, cardW, cardH, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text(card.label.toUpperCase(), x + 3, startY + 6);
    if (card.sub) {
      doc.setFontSize(5);
      doc.text(card.sub, x + 3, startY + 10);
    }
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(String(card.value), x + 3, startY + cardH - 5);
    x += cardW + gap;
  }

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  return startY + cardH + 8;
}

export function buildAssemblyAttendancePdf(date: string, assemblyName: string, rows: AttendanceExportRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const summary = computeSummary(rows);

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Date-wise attendance", 14, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Halka: ${assemblyName}`, 14, 21);
  doc.text(`Date: ${fmtDate(date)}`, 14, 27);

  const tableStartY = drawSummaryCards(doc, summary, 34);

  autoTable(doc, {
    startY: tableStartY,
    head: [["User", "Assembly / Sector", "Zone / District", "Punch in", "Punch out", "Hours", "Status", "Why"]],
    body: rows.map((r) => [
      `${r.name}\n${r.phone}\n${r.designation}`,
      `${r.assemblyName}\n${r.sectorAllotted}`,
      `${r.zone || "—"}\n${r.district || "—"}`,
      fmtTime(r.punchInAt),
      fmtTime(r.punchOutAt),
      r.hoursWorked > 0
        ? `${r.hoursWorked}h${(r.sessionCount || 0) > 1 ? `\n${r.sessionCount} sessions` : ""}`
        : "—",
      `${rowStatusLabel(r.status, r.statusLabel)}\n${r.source === "manual" ? "Manual" : "Auto"}`,
      r.reason || "",
    ]),
    styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak", valign: "top" },
    headStyles: { fillColor: [238, 243, 251], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 7 },
    alternateRowStyles: { fillColor: [247, 249, 253] },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 38 },
      2: { cellWidth: 32 },
      3: { cellWidth: 22 },
      4: { cellWidth: 22 },
      5: { cellWidth: 16 },
      6: { cellWidth: 24 },
      7: { cellWidth: "auto" },
    },
    margin: { left: 14, right: 14 },
  });

  return doc.output("arraybuffer");
}

export async function downloadAssemblyAttendancePdfZip(date: string, rows: AttendanceExportRow[]) {
  if (!rows.length) return;

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  const byAssembly = new Map<string, AttendanceExportRow[]>();
  for (const row of rows) {
    const key = row.assemblyName || "Unknown";
    const list = byAssembly.get(key) || [];
    list.push(row);
    byAssembly.set(key, list);
  }

  const usedNames = new Set<string>();
  for (const [assemblyName, assemblyRows] of Array.from(byAssembly.entries())) {
    let filename = assemblyExportFileName(assemblyName, "pdf");
    if (usedNames.has(filename)) {
      const base = filename.replace(/\.pdf$/i, "");
      let i = 2;
      while (usedNames.has(`${base}_${i}.pdf`)) i += 1;
      filename = `${base}_${i}.pdf`;
    }
    usedNames.add(filename);
    const pdfBytes = buildAssemblyAttendancePdf(date, assemblyName, assemblyRows);
    zip.file(filename, pdfBytes);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance-${date}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
