function csvEscape(value: string | number | null | undefined) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const body = [headers.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\r\n");
  const blob = new Blob(["\uFEFF" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export type PdfSummaryCard = {
  label: string;
  value: number | string;
  hint?: string;
  /** Card background (hex / css color). */
  background: string;
  /** Text color; default white. */
  color?: string;
};

export type DownloadPdfOptions = {
  subtitle?: string;
  summaryCards?: PdfSummaryCard[];
  /** Table header background (hex). */
  tableAccent?: string;
  tableAccentText?: string;
};

export function downloadPdf(
  title: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  opts?: DownloadPdfOptions
) {
  const th = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const trs = rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c == null ? "" : String(c))}</td>`).join("")}</tr>`)
    .join("");
  const cards = opts?.summaryCards || [];
  const cardsHtml = cards.length
    ? `<div class="cards">${cards
        .map(
          (c) => `<div class="card" style="background:${escapeHtml(c.background)};color:${escapeHtml(c.color || "#fff")}">
  <div class="card-label">${escapeHtml(c.label)}</div>
  <div class="card-value">${escapeHtml(String(c.value))}</div>
  ${c.hint ? `<div class="card-hint">${escapeHtml(c.hint)}</div>` : ""}
</div>`
        )
        .join("")}</div>`
    : "";
  const accent = opts?.tableAccent || "#eef3fb";
  const accentText = opts?.tableAccentText || "#0a1628";
  const subtitle =
    opts?.subtitle ||
    `${rows.length} row(s) · ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0a1628; margin: 18px; background: linear-gradient(#fff6d4, #f3f6fb); }
  h1 { font-size: 18px; margin: 0 0 4px; color: #12305A; }
  .meta { font-size: 12px; color: #445; margin: 0 0 14px; }
  .cards { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; margin: 0 0 16px; }
  .card { border-radius: 10px; padding: 10px 12px; box-shadow: 0 1px 2px rgba(10,22,40,.12); break-inside: avoid; }
  .card-label { font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; opacity: .9; }
  .card-value { font-size: 22px; font-weight: 700; margin-top: 4px; line-height: 1.1; }
  .card-hint { font-size: 9px; opacity: .8; margin-top: 4px; }
  table { border-collapse: collapse; width: 100%; font-size: 10px; background: #fff; }
  th, td { border: 1px solid #ccd4e0; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: ${escapeHtml(accent)}; color: ${escapeHtml(accentText)}; }
  tbody tr:nth-child(even) { background: #f7f9fd; }
  @media print {
    body { background: #fff; margin: 0; }
    .card { box-shadow: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<p class="meta">${escapeHtml(subtitle)}</p>
${cardsHtml}
<table><thead><tr>${th}</tr></thead><tbody>${trs || `<tr><td colspan="${headers.length}">No rows</td></tr>`}</tbody></table>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) {
    alert("Allow pop-ups to download PDF.");
    return;
  }
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function uniqueSorted(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

export function reasonLabel(reason?: string | null, punchOutAt?: string | null) {
  if (!punchOutAt && !reason) return "Live";
  if (reason === "gps_off") return "GPS off";
  if (reason === "auto_12h") return "Auto · 12 hours";
  if (reason === "auto_geofence") return "Auto · left 1000 m boundary";
  if (reason === "gps_spoof") return "Auto · fake / invalid GPS";
  if (reason === "fake_gps") return "Auto · Fake GPS (mock)";
  if (reason === "vpn") return "Auto · VPN";
  if (reason === "admin_present") return "Manual present by admin";
  if (reason === "admin_leave") return "Closed for leave by admin";
  if (reason === "manual") return "Manual punch-out";
  if (reason === "tracking_gap") return "Tracking gap";
  if (punchOutAt) return "Completed";
  return reason || "—";
}
