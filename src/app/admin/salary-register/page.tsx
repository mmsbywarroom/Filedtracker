"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadCsv } from "@/lib/reportExport";
import { dayHeader } from "@/lib/salaryRegister";
import { hierarchyDesignations } from "@/lib/hierarchy";

type Row = {
  userId: string;
  name: string;
  phone: string;
  designation: string;
  zone: string;
  district: string;
  assemblyName: string;
  cells: Record<string, string>;
  present: number;
  halfDay: number;
  absent: number;
  leave: number;
};

function monthValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export default function SalaryRegisterPage() {
  const now = new Date();
  const [month, setMonth] = useState(monthValue(now.getFullYear(), now.getMonth() + 1));
  const [designation, setDesignation] = useState("");
  const [zone, setZone] = useState("");
  const [q, setQ] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [visibleDens, setVisibleDens] = useState<string[]>(() => hierarchyDesignations());

  async function load() {
    const [y, m] = month.split("-").map(Number);
    setBusy(true);
    const params = new URLSearchParams({ year: String(y), month: String(m) });
    if (designation) params.set("designation", designation);
    const res = await fetch(`/api/admin/salary-register?${params}`);
    setBusy(false);
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const data = await res.json();
    setDays(data.days || []);
    setRows(data.rows || []);
  }

  useEffect(() => {
    void load();
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.admin?.visibleDesignations) && d.admin.visibleDesignations.length) {
          setVisibleDens(d.admin.visibleDesignations);
        }
      })
      .catch(() => {});
  }, [month, designation]);

  const zones = useMemo(
    () => Array.from(new Set(rows.map((r) => r.zone).filter(Boolean))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (zone && r.zone !== zone) return false;
      if (!text) return true;
      return [r.name, r.phone, r.assemblyName, r.designation, r.district].join(" ").toLowerCase().includes(text);
    });
  }, [rows, zone, q]);

  function exportCsv() {
    const [y, m] = month.split("-");
    const headers = [
      "Name",
      "Phone",
      "Designation",
      "Zone",
      "District",
      "Assembly",
      ...days.map(dayHeader),
      "P days",
      "HD days",
      "A days",
      "L days",
    ];
    const data = filtered.map((r) => [
      r.name,
      r.phone,
      r.designation,
      r.zone,
      r.district,
      r.assemblyName,
      ...days.map((d) => r.cells[d] || ""),
      r.present,
      r.halfDay,
      r.absent,
      r.leave,
    ]);
    downloadCsv(`salary-register-${y}-${m}`, headers, data);
  }

  const title = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
  }, [month]);

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="admin-page-kicker">Attendance</p>
      <h1 className="admin-page-title">Salary register</h1>
      <p className="admin-page-sub">
        User-wise, date-wise download for payroll. P / HD show punch-in time. A shows absent reason. L is leave /
        holiday.
      </p>

      <div className="admin-toolbar mt-4 mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-navy/60">
          Month
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="admin-field mt-1 block h-11 rounded-xl border border-navy/15 bg-white px-3 text-sm shadow-sm"
          />
        </label>
        <label className="text-xs font-semibold text-navy/60">
          Designation
          <select
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            className="admin-field mt-1 block h-11 min-w-[160px] rounded-xl border border-navy/15 bg-white px-3 text-sm shadow-sm"
          >
            <option value="">All designations</option>
            {visibleDens.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-navy/60">
          Zone
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="admin-field mt-1 block h-11 min-w-[140px] rounded-xl border border-navy/15 bg-white px-3 text-sm shadow-sm"
          >
            <option value="">All zones</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[180px] flex-1 text-xs font-semibold text-navy/60">
          Search
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, phone, assembly"
            className="admin-field mt-1 block h-11 w-full rounded-xl border border-navy/15 bg-white px-3 text-sm shadow-sm"
          />
        </label>
        <button type="button" disabled={busy} className="admin-btn-ink h-11" onClick={() => void load()}>
          {busy ? "Loading…" : "Refresh"}
        </button>
        <button type="button" disabled={busy || !filtered.length} className="admin-btn-primary h-11" onClick={exportCsv}>
          Download CSV
        </button>
      </div>

      <p className="mb-3 text-xs text-navy/50">
        {title} · {filtered.length} users · P = Present + time · HD = Half-day + time · A = Absent + reason · L = Leave
      </p>

      <section className="admin-panel overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
              <tr>
                <th className="sticky left-0 z-10 bg-[#eef3fb] px-3 py-3">User</th>
                {days.map((d) => (
                  <th key={d} className="px-2 py-3 text-center">
                    {dayHeader(d)}
                  </th>
                ))}
                <th className="px-2 py-3">P</th>
                <th className="px-2 py-3">HD</th>
                <th className="px-2 py-3">A</th>
                <th className="px-2 py-3">L</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 80).map((r) => (
                <tr key={r.userId} className="border-t border-navy/5 hover:bg-[#f7f9fd]">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2">
                    <p className="font-semibold text-sm">{r.name}</p>
                    <p className="text-[11px] text-navy/45">{r.phone}</p>
                  </td>
                  {days.map((d) => (
                    <td key={d} className="whitespace-nowrap px-2 py-2 text-navy/80">
                      {r.cells[d] || "—"}
                    </td>
                  ))}
                  <td className="px-2 py-2 font-medium">{r.present}</td>
                  <td className="px-2 py-2">{r.halfDay}</td>
                  <td className="px-2 py-2">{r.absent}</td>
                  <td className="px-2 py-2">{r.leave}</td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={days.length + 5} className="px-4 py-8 text-center text-sm text-navy/50">
                    {busy ? "Loading…" : "No users for this month / filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 80 && (
          <p className="border-t border-navy/5 px-4 py-3 text-xs text-navy/50">
            Showing first 80 rows. Download CSV for the full list ({filtered.length} users).
          </p>
        )}
      </section>
    </main>
  );
}
