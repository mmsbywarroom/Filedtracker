"use client";

import { useEffect, useMemo, useState } from "react";
import { PaginationBar } from "@/components/PaginationBar";

type Row = {
  userId: string;
  name: string;
  phone: string;
  designation: string;
  assemblyName: string;
  sectorAllotted: string;
  zone: string;
  district: string;
  status: "present" | "absent" | "leave";
  statusLabel: string;
  source: "auto" | "manual";
  reason: string;
  hoursWorked: number;
  punchInAt: string | null;
  punchOutAt: string | null;
};

type Summary = { present: number; absent: number; leave: number; total: number };

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
}

function statusClass(status: string) {
  if (status === "present") return "bg-emerald-50 text-emerald-700";
  if (status === "leave") return "bg-sky-50 text-sky-800";
  return "bg-red-50 text-red-700";
}

export default function AttendanceModulePage() {
  const [date, setDate] = useState(todayIst);
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>({ present: 0, absent: 0, leave: 0, total: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  async function load() {
    const params = new URLSearchParams({ date });
    if (statusFilter) params.set("status", statusFilter);
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(`/api/admin/daily-attendance?${params}`);
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const data = await res.json();
    setRows(data.rows || []);
    setSummary(data.summary || { present: 0, absent: 0, leave: 0, total: 0 });
    setPage(1);
  }

  useEffect(() => {
    load();
  }, [date]);

  async function setStatus(userId: string, status: "present" | "absent" | "leave") {
    setBusy(userId);
    const res = await fetch("/api/admin/daily-attendance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, date, status }),
    });
    setBusy(null);
    if (res.ok) load();
  }

  const pageRows = useMemo(() => rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), [rows, page, pageSize]);

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Attendance</p>
      <h1 className="text-2xl font-semibold">Date-wise attendance</h1>
      <p className="mt-1 text-sm text-navy/55">
        Auto: no punch or ≤6h = Absent · 8–12h = Present · approved leave = Leave. Admin can change manually.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-emerald-600 px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">Present</p>
          <p className="text-2xl font-semibold">{summary.present}</p>
        </div>
        <div className="rounded-2xl bg-red-600 px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">Absent</p>
          <p className="text-2xl font-semibold">{summary.absent}</p>
        </div>
        <div className="rounded-2xl bg-sky-600 px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">Leave</p>
          <p className="text-2xl font-semibold">{summary.leave}</p>
        </div>
        <div className="rounded-2xl bg-ink px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">Total</p>
          <p className="text-2xl font-semibold">{summary.total}</p>
        </div>
      </div>

      <div className="mt-4 mb-4 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-card">
        <label className="text-xs font-medium text-navy/55">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block rounded-xl border border-navy/10 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-navy/55">
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="mt-1 block rounded-xl border border-navy/10 px-3 py-2 text-sm"
          >
            <option value="">All</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="leave">Leave</option>
          </select>
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, assembly"
          className="h-11 min-w-[200px] flex-1 rounded-xl border border-navy/10 px-3 text-sm"
        />
        <button type="button" onClick={load} className="h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white">
          Apply
        </button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-navy/5 bg-white shadow-card">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Assembly / Sector</th>
                <th className="px-4 py-3">Punch in</th>
                <th className="px-4 py-3">Punch out</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Why</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.userId} className="border-t border-navy/5 hover:bg-[#f7f9fd]">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-xs text-navy/50">{r.phone}</p>
                    <p className="text-xs text-navy/45">{r.designation}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.assemblyName}</p>
                    <p className="text-xs text-navy/50">{r.sectorAllotted}</p>
                  </td>
                  <td className="px-4 py-3">{fmtTime(r.punchInAt)}</td>
                  <td className="px-4 py-3">{fmtTime(r.punchOutAt)}</td>
                  <td className="px-4 py-3 font-medium">{r.hoursWorked > 0 ? `${r.hoursWorked}h` : "—"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={r.status}
                      disabled={busy === r.userId}
                      onChange={(e) => setStatus(r.userId, e.target.value as "present" | "absent" | "leave")}
                      className={`rounded-xl border border-navy/10 px-2 py-1.5 text-xs font-semibold ${statusClass(r.status)}`}
                    >
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                      <option value="leave">Leave</option>
                    </select>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-navy/40">
                      {r.source === "manual" ? "Manual" : "Auto"}
                    </p>
                  </td>
                  <td className="px-4 py-3 max-w-[220px] text-xs text-navy/55">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="p-8 text-center text-sm text-navy/50">No users for this date / filter.</p>}
        </div>
        {!!rows.length && (
          <PaginationBar page={page} pageSize={pageSize} total={rows.length} onPage={setPage} onPageSize={setPageSize} />
        )}
      </section>
    </main>
  );
}
