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

export function downloadPdf(title: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const th = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const trs = rows
    .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c == null ? "" : String(c))}</td>`).join("")}</tr>`)
    .join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #0a1628; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { font-size: 12px; color: #445; margin: 0 0 16px; }
  table { border-collapse: collapse; width: 100%; font-size: 11px; }
  th, td { border: 1px solid #ccd4e0; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #eef3fb; }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<p>${rows.length} row(s) · ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
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
  if (reason === "admin_present") return "Manual present by admin";
  if (reason === "manual") return "Manual punch-out";
  if (punchOutAt) return "Completed";
  return reason || "—";
}
