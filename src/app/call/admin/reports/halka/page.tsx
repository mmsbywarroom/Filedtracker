"use client";

import { useEffect, useMemo, useState } from "react";

type HalkaRow = {
  zone: string;
  halka: string;
  raw?: boolean;
  total: number;
  dialed: number;
  notAttempted: number;
  connected: number;
  complete: number;
  notConnected: number;
  coordinatorYes: number;
  coordinatorNo: number;
  villageYes: number;
  villageNo: number;
};

const BLUE = "#1d4ed8";
const RED = "#dc2626";
const GREEN = "#166534";
const GOLD = "#eab308";
const PINK = "#e11d48";
const NAVY = "#1e1b4b";
const YELLOW = "#facc15";
const CYAN = "#22d3ee";
const ROW = "#e0f2fe";

function sumRows(rows: HalkaRow[]): HalkaRow {
  return rows.reduce(
    (total, row) => ({
      zone: "",
      halka: "Total",
      total: total.total + row.total,
      dialed: total.dialed + row.dialed,
      notAttempted: total.notAttempted + row.notAttempted,
      connected: total.connected + row.connected,
      complete: total.complete + row.complete,
      notConnected: total.notConnected + row.notConnected,
      coordinatorYes: total.coordinatorYes + row.coordinatorYes,
      coordinatorNo: total.coordinatorNo + row.coordinatorNo,
      villageYes: total.villageYes + row.villageYes,
      villageNo: total.villageNo + row.villageNo,
    }),
    {
      zone: "",
      halka: "Total",
      total: 0,
      dialed: 0,
      notAttempted: 0,
      connected: 0,
      complete: 0,
      notConnected: 0,
      coordinatorYes: 0,
      coordinatorNo: 0,
      villageYes: 0,
      villageNo: 0,
    }
  );
}

function pdfTitle(label: string, fallback: string) {
  return /^[\x00-\x7F\s?,'’./:-]+$/.test(label) && label.trim() ? label : fallback;
}

export default function HalkaReportPage() {
  const [rows, setRows] = useState<HalkaRow[]>([]);
  const [coordinatorLabel, setCoordinatorLabel] = useState("Village coordinator");
  const [villageLabel, setVillageLabel] = useState("Village match");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/call/admin/reports/halka").then(async (res) => {
      if (res.status === 401) {
        window.location.href = "/call/admin/login";
        return;
      }
      const data = await res.json();
      setRows(data.rows || []);
      setCoordinatorLabel(data.coordinatorLabel || "Village coordinator");
      setVillageLabel(data.villageLabel || "Village match");
    });
  }, []);

  const total = useMemo(() => sumRows(rows), [rows]);

  async function downloadPdf() {
    setBusy(true);
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Halka calling report", 10, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Counts for every halka on the call list.", 10, 18);
    const headStyles = { halign: "center" as const, valign: "middle" as const, fontStyle: "bold" as const, fontSize: 8, textColor: 255 };
    autoTable(doc, {
      startY: 22,
      head: [
        [
          { content: "Sr. No.", rowSpan: 2, styles: { ...headStyles, fillColor: BLUE } },
          { content: "Zone", rowSpan: 2, styles: { ...headStyles, fillColor: BLUE } },
          { content: "Vidhansabha", rowSpan: 2, styles: { ...headStyles, fillColor: BLUE } },
          { content: "Total Calls", rowSpan: 2, styles: { ...headStyles, fillColor: BLUE } },
          { content: "Total Calls Dialed", rowSpan: 2, styles: { ...headStyles, fillColor: BLUE } },
          { content: "Calls Not Yet Attempted", rowSpan: 2, styles: { ...headStyles, fillColor: RED } },
          { content: "Connected Calls", rowSpan: 2, styles: { ...headStyles, fillColor: GREEN } },
          { content: "Call Complete", rowSpan: 2, styles: { ...headStyles, fillColor: GOLD, textColor: 20 } },
          { content: "Not Connected", rowSpan: 2, styles: { ...headStyles, fillColor: PINK } },
          { content: pdfTitle(coordinatorLabel, "Village coordinator?"), colSpan: 2, styles: { ...headStyles, fillColor: NAVY, textColor: YELLOW } },
          { content: "Village Match", colSpan: 2, styles: { ...headStyles, fillColor: YELLOW, textColor: 20 } },
        ],
        [
          { content: "Yes", styles: { ...headStyles, fillColor: GREEN } },
          { content: "No", styles: { ...headStyles, fillColor: RED } },
          { content: "Yes", styles: { ...headStyles, fillColor: GREEN } },
          { content: "No", styles: { ...headStyles, fillColor: RED } },
        ],
      ],
      body: [
        ["", total.zone, "Total", total.total, total.dialed, total.notAttempted, total.connected, total.complete, total.notConnected, total.coordinatorYes, total.coordinatorNo, total.villageYes, total.villageNo],
        ...rows.map((row, index) => [
          index + 1,
          row.zone,
          row.halka,
          row.total,
          row.dialed,
          row.notAttempted,
          row.connected,
          row.complete,
          row.notConnected,
          row.coordinatorYes,
          row.coordinatorNo,
          row.villageYes,
          row.villageNo,
        ]),
      ],
      styles: { fontSize: 8, halign: "center", valign: "middle", lineColor: [191, 219, 254], lineWidth: 0.1 },
      alternateRowStyles: { fillColor: ROW },
      didParseCell: (hook) => {
        if (hook.section === "body" && hook.row.index === 0) {
          hook.cell.styles.fillColor = CYAN;
          hook.cell.styles.fontStyle = "bold";
          hook.cell.styles.textColor = 15;
        }
      },
      margin: { left: 8, right: 8 },
    });
    doc.save("halka-calling-report.pdf");
    setBusy(false);
  }

  const head = "border border-white/40 px-2 py-2 text-center text-[11px] font-bold leading-tight text-white";

  return (
    <main className="px-4 py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Halka report</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">Counts use the latest submission for each number, the same row as the submissions download. Question 2 Yes counts as Yes. Question 2 No counts as No, unless Question 2.1 is Yes. Village match counts only those Yes rows. Total Calls also includes numbers that have not been called yet, so it is larger than the submissions file.</p>
        </div>
        <button type="button" disabled={busy || !rows.length} onClick={() => void downloadPdf()} className="rounded-xl bg-[#0A1628] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Preparing PDF…" : "Download PDF"}
        </button>
      </div>
      <div className="overflow-auto rounded-2xl bg-white shadow-sm">
        <table className="min-w-max border-collapse text-xs">
          <thead>
            <tr>
              <th rowSpan={2} className={head} style={{ background: BLUE }}>Sr. No.</th>
              <th rowSpan={2} className={head} style={{ background: BLUE }}>Zone</th>
              <th rowSpan={2} className={head} style={{ background: BLUE }}>Vidhansabha</th>
              <th rowSpan={2} className={head} style={{ background: BLUE }}>Total Calls</th>
              <th rowSpan={2} className={head} style={{ background: BLUE }}>Total Calls Dialed</th>
              <th rowSpan={2} className={head} style={{ background: RED }}>Calls Not Yet Attempted</th>
              <th rowSpan={2} className={head} style={{ background: GREEN }}>Connected Calls</th>
              <th rowSpan={2} className={head} style={{ background: GOLD, color: "#1c1917" }}>Call Complete</th>
              <th rowSpan={2} className={head} style={{ background: PINK }}>Not Connected</th>
              <th colSpan={2} className={head} style={{ background: NAVY, color: YELLOW, fontFamily: "var(--font-pa), sans-serif", maxWidth: 220 }}>{coordinatorLabel}</th>
              <th colSpan={2} className={head} style={{ background: YELLOW, color: "#1c1917" }}>Village Match</th>
            </tr>
            <tr>
              <th className={head} style={{ background: GREEN }}>Yes</th>
              <th className={head} style={{ background: RED }}>No</th>
              <th className={head} style={{ background: GREEN }}>Yes</th>
              <th className={head} style={{ background: RED }}>No</th>
            </tr>
          </thead>
          <tbody>
            <tr className="font-bold" style={{ background: CYAN }}>
              <td className="border border-sky-200 px-2 py-2" />
              <td className="border border-sky-200 px-2 py-2" />
              <Count value="Total" href={reportHref("total")} />
              <Count value={total.total} href={reportHref("total")} />
              <Count value={total.dialed} href={reportHref("dialed")} />
              <Count value={total.notAttempted} href={reportHref("notAttempted")} />
              <Count value={total.connected} href={reportHref("connected")} />
              <Count value={total.complete} href={reportHref("complete")} />
              <Count value={total.notConnected} href={reportHref("notConnected")} />
              <Count value={total.coordinatorYes} href={reportHref("coordinatorYes")} />
              <Count value={total.coordinatorNo} href={reportHref("coordinatorNo")} />
              <Count value={total.villageYes} href={reportHref("villageYes")} />
              <Count value={total.villageNo} href={reportHref("villageNo")} />
            </tr>
            {rows.map((row, index) => (
              <tr key={`${row.zone}-${row.halka}`} style={{ background: index % 2 === 0 ? ROW : "#ffffff" }}>
                <td className="border border-sky-100 px-2 py-2 text-center font-semibold text-blue-700">{index + 1}</td>
                <td className="border border-sky-100 px-2 py-2">{row.zone}</td>
                <td className="border border-sky-100 px-2 py-2 font-semibold text-blue-800">
                  <a href={reportHref("total", row)} className="underline decoration-blue-300 underline-offset-2 hover:text-blue-950">{row.halka}</a>
                </td>
                <Count value={row.total} href={reportHref("total", row)} />
                <Count value={row.dialed} href={reportHref("dialed", row)} />
                <Count value={row.notAttempted} href={reportHref("notAttempted", row)} />
                <Count value={row.connected} href={reportHref("connected", row)} />
                <Count value={row.complete} href={reportHref("complete", row)} />
                <Count value={row.notConnected} href={reportHref("notConnected", row)} />
                <Count value={row.coordinatorYes} href={reportHref("coordinatorYes", row)} />
                <Count value={row.coordinatorNo} href={reportHref("coordinatorNo", row)} />
                <Count value={row.villageYes} href={reportHref("villageYes", row)} />
                <Count value={row.villageNo} href={reportHref("villageNo", row)} />
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="p-6 text-sm text-slate-500">No halkas on the call list yet.</p> : null}
      </div>
      <p className="mt-2 text-xs text-slate-500" style={{ fontFamily: "var(--font-pa), sans-serif" }}>Village question: {villageLabel}</p>
    </main>
  );
}

function reportHref(metric: string, row?: HalkaRow) {
  const params = new URLSearchParams({ metric });
  if (row && row.halka !== "Total") {
    params.set("halka", row.halka);
    if (row.raw) {
      params.set("raw", "1");
      params.set("zone", row.zone);
    }
  }
  return `/call/admin/submissions?${params}`;
}

function Count({ value, href }: { value: number | string; href: string }) {
  return (
    <td className="border border-sky-100 px-2 py-2 text-center tabular-nums">
      <a href={href} className="font-semibold text-blue-800 underline decoration-blue-300 underline-offset-2 hover:text-blue-950">
        {value}
      </a>
    </td>
  );
}
