import { assemblyExportFileName } from "@/lib/assemblyHalkaCodes";

export type AttendanceExportRow = {
  name: string;
  phone: string;
  designation: string;
  assemblyName: string;
  sectorAllotted: string;
  zone: string;
  district: string;
  status: string;
  statusLabel: string;
  source: string;
  reason: string;
  hoursWorked: number;
  punchInAt: string | null;
  punchOutAt: string | null;
  sessionCount?: number;
};

function csvEscape(value: string | number | null | undefined) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtIstTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

const EXPORT_HEADERS = [
  "Date",
  "Name",
  "Phone",
  "Designation",
  "Assembly",
  "Sector",
  "Zone",
  "District",
  "Punch In",
  "Punch Out",
  "Hours",
  "Status",
  "Source",
  "Reason",
  "Sessions",
];

export function attendanceRowsToCsv(date: string, rows: AttendanceExportRow[]) {
  const body = [
    EXPORT_HEADERS.map(csvEscape).join(","),
    ...rows.map((r) =>
      [
        date,
        r.name,
        r.phone,
        r.designation,
        r.assemblyName,
        r.sectorAllotted,
        r.zone,
        r.district,
        fmtIstTime(r.punchInAt),
        fmtIstTime(r.punchOutAt),
        r.hoursWorked > 0 ? r.hoursWorked : "",
        r.statusLabel || r.status,
        r.source === "manual" ? "Manual" : "Auto",
        r.reason,
        r.sessionCount && r.sessionCount > 1 ? r.sessionCount : "",
      ]
        .map(csvEscape)
        .join(",")
    ),
  ].join("\r\n");
  return "\uFEFF" + body;
}

export async function downloadAssemblyAttendanceZip(date: string, rows: AttendanceExportRow[]) {
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
    let filename = assemblyExportFileName(assemblyName);
    if (usedNames.has(filename)) {
      const base = filename.replace(/\.csv$/i, "");
      let i = 2;
      while (usedNames.has(`${base}_${i}.csv`)) i += 1;
      filename = `${base}_${i}.csv`;
    }
    usedNames.add(filename);
    zip.file(filename, attendanceRowsToCsv(date, assemblyRows));
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance-${date}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
