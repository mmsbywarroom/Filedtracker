"use client";

import { useEffect, useState } from "react";

type Row = {
  userId: string;
  name: string;
  phone: string;
  assemblyName: string;
  sectorAllotted: string;
  zone: string;
  district: string;
  statusLabel: string;
  hoursWorked: number;
  punchInAt: string | null;
  punchOutAt: string | null;
};

type Summary = { total: number; present: number; halfDay: number; absent: number; leave: number; pending: number };

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
}

export default function CallCenterAttendancePage() {
  const [date, setDate] = useState(todayIst);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    fetch(`/api/call/admin/attendance?date=${encodeURIComponent(date)}`).then(async (res) => {
      if (res.status === 401) {
        window.location.href = "/call/admin/login";
        return;
      }
      const data = await res.json();
      setRows(data.rows || []);
      setSummary(data.summary || null);
    });
  }, [date]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Call center attendance</h1>
          <p className="mt-1 text-sm text-slate-600">Punch in and punch out for Call Center users only.</p>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-xl border px-3 text-sm" />
      </div>
      {summary ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-6">
          {[
            ["Total", summary.total],
            ["Present", summary.present],
            ["Half day", summary.halfDay],
            ["Absent", summary.absent],
            ["Leave", summary.leave],
            ["Pending", summary.pending],
          ].map(([label, n]) => (
            <div key={String(label)} className="rounded-xl bg-white px-3 py-3 shadow-sm">
              <p className="text-xl font-semibold">{n}</p>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-4 overflow-auto rounded-2xl bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              {["Name", "Mobile", "Assembly", "Zone", "District", "Status", "Hours", "Punch in", "Punch out"].map((h) => (
                <th key={h} className="bg-slate-50 px-3 py-2 text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId} className="border-t">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2">{r.phone}</td>
                <td className="px-3 py-2">{r.assemblyName}</td>
                <td className="px-3 py-2">{r.zone}</td>
                <td className="px-3 py-2">{r.district}</td>
                <td className="px-3 py-2">{r.statusLabel}</td>
                <td className="px-3 py-2">{r.hoursWorked}</td>
                <td className="px-3 py-2">{fmt(r.punchInAt)}</td>
                <td className="px-3 py-2">{fmt(r.punchOutAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="p-6 text-sm text-slate-500">No Call Center users for this day.</p> : null}
      </div>
    </main>
  );
}
