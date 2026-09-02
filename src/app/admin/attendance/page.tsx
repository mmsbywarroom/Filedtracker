"use client";

import { useEffect, useMemo, useState } from "react";
import { PaginationBar } from "@/components/PaginationBar";
import { SearchSelect } from "@/components/SearchSelect";
import { hierarchyDesignations } from "@/lib/hierarchy";
import { downloadAssemblyAttendancePdfZip } from "@/lib/assemblyAttendancePdf";

type AttStatus = "present" | "half_day" | "absent" | "leave";
type RowStatus = AttStatus | "pending";

type Row = {
  userId: string;
  name: string;
  phone: string;
  designation: string;
  assemblyName: string;
  sectorAllotted: string;
  zone: string;
  district: string;
  status: RowStatus;
  statusLabel: string;
  source: "auto" | "manual";
  reason: string;
  hoursWorked: number;
  punchInAt: string | null;
  punchOutAt: string | null;
  sessionCount?: number;
  flagged?: boolean;
  flagReason?: string;
  flagSameCount?: number;
};

type Summary = {
  present: number;
  halfDay: number;
  absent: number;
  leave: number;
  pending: number;
  flagged: number;
  total: number;
};

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
}

function statusClass(status: string) {
  if (status === "present") return "bg-emerald-50 text-emerald-700";
  if (status === "half_day") return "bg-amber-50 text-amber-800";
  if (status === "leave") return "bg-sky-50 text-sky-800";
  if (status === "pending") return "bg-orange-50 text-orange-800";
  return "bg-red-50 text-red-700";
}

function statusTitle(status: RowStatus) {
  if (status === "half_day") return "Half-day";
  if (status === "pending") return "Pending punch-in";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function unique(rows: Row[], key: keyof Row) {
  return Array.from(new Set(rows.map((r) => String(r[key] || "")).filter(Boolean))).sort();
}

const selectClass = "h-11 w-full rounded-xl border border-navy/15 bg-white px-3 text-sm shadow-sm";

export default function AttendanceModulePage() {
  const [date, setDate] = useState(todayIst);
  const [statusFilter, setStatusFilter] = useState("");
  const [flagFilter, setFlagFilter] = useState("");
  const [zone, setZone] = useState("");
  const [district, setDistrict] = useState("");
  const [assembly, setAssembly] = useState("");
  const [designation, setDesignation] = useState("");
  const [sector, setSector] = useState("");
  const [q, setQ] = useState("");
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [visibleDens, setVisibleDens] = useState<string[]>(() => hierarchyDesignations());
  const [pending, setPending] = useState<{
    userId: string;
    name: string;
    status: AttStatus;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [statusErr, setStatusErr] = useState("");
  const [zipBusy, setZipBusy] = useState(false);

  async function load() {
    const params = new URLSearchParams({ date });
    const res = await fetch(`/api/admin/daily-attendance?${params}`);
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const data = await res.json();
    setAllRows(data.rows || []);
    setPage(1);
  }

  useEffect(() => {
    load();
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.admin?.visibleDesignations) && d.admin.visibleDesignations.length) {
          setVisibleDens(d.admin.visibleDesignations);
        }
      })
      .catch(() => {});
  }, [date]);

  const rows = useMemo(() => {
    const sectorQ = sector.trim().toLowerCase();
    const textQ = q.trim().toLowerCase();
    return allRows.filter((r) => {
      if (zone && r.zone !== zone) return false;
      if (district && r.district !== district) return false;
      if (assembly && r.assemblyName !== assembly) return false;
      if (designation && r.designation !== designation) return false;
      if (sectorQ && !(r.sectorAllotted || "").toLowerCase().includes(sectorQ)) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (flagFilter === "flagged" && !r.flagged) return false;
      if (flagFilter === "not_flagged" && r.flagged) return false;
      if (textQ) {
        const text = [r.name, r.phone, r.assemblyName, r.designation, r.zone, r.district, r.sectorAllotted]
          .join(" ")
          .toLowerCase();
        if (!text.includes(textQ)) return false;
      }
      return true;
    });
  }, [allRows, zone, district, assembly, designation, sector, statusFilter, flagFilter, q]);

  const summary = useMemo(() => {
    const s: Summary = { present: 0, halfDay: 0, absent: 0, leave: 0, pending: 0, flagged: 0, total: rows.length };
    for (const r of rows) {
      if (r.status === "present") s.present += 1;
      else if (r.status === "half_day") s.halfDay += 1;
      else if (r.status === "leave") s.leave += 1;
      else if (r.status === "pending") s.pending += 1;
      else s.absent += 1;
      if (r.flagged) s.flagged += 1;
    }
    return s;
  }, [rows]);

  useEffect(() => {
    setPage(1);
  }, [zone, district, assembly, designation, sector, statusFilter, flagFilter, q, pageSize]);

  async function applyStatus() {
    if (!pending) return;
    if (reason.trim().length < 3) {
      setStatusErr("Reason is required (at least 3 characters).");
      return;
    }
    setBusy(pending.userId);
    setStatusErr("");
    const res = await fetch("/api/admin/daily-attendance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: pending.userId, date, status: pending.status, note: reason.trim() }),
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatusErr(data.error || "Could not update status.");
      return;
    }
    setPending(null);
    setReason("");
    load();
  }

  function requestStatus(userId: string, name: string, status: AttStatus, current: string) {
    if (status === current) return;
    setPending({ userId, name, status });
    setReason("");
    setStatusErr("");
  }

  const pageRows = useMemo(() => rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), [rows, page, pageSize]);

  async function downloadZip() {
    if (!allRows.length) return;
    setZipBusy(true);
    try {
      await downloadAssemblyAttendancePdfZip(date, allRows);
    } finally {
      setZipBusy(false);
    }
  }

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Attendance</p>
      <h1 className="text-2xl font-semibold">Date-wise attendance</h1>
      <p className="mt-1 text-sm text-navy/55">
        Auto: punch by 10:30 + 6–12h = Present · after 10:30 to 1:00 = Half-day · after 1:00 PM no punch = Absent ·
        until 1:00 PM, no punch stays Pending. Leave mark / approved leave / holiday (that designation) = Leave. Multiple punch-ins
        the same day (e.g. after GPS/phone off) are added together for hours. Manual change requires a reason. Flag: 8+ thirty-minute
        location checks at the same lat/lng during a session (no block — admin review only).
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <div className="rounded-2xl bg-emerald-600 px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">Present</p>
          <p className="text-2xl font-semibold">{summary.present}</p>
        </div>
        <div className="rounded-2xl bg-amber-500 px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">Half-day</p>
          <p className="text-2xl font-semibold">{summary.halfDay}</p>
        </div>
        <div className="rounded-2xl bg-orange-500 px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">Pending</p>
          <p className="text-2xl font-semibold">{summary.pending}</p>
        </div>
        <div className="rounded-2xl bg-red-600 px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">Absent</p>
          <p className="text-xs text-white/70">After 1:00 PM</p>
          <p className="text-2xl font-semibold">{summary.absent}</p>
        </div>
        <div className="rounded-2xl bg-sky-600 px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">Leave</p>
          <p className="text-2xl font-semibold">{summary.leave}</p>
        </div>
        <div className="rounded-2xl bg-violet-600 px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">Flagged</p>
          <p className="text-xs text-white/70">Same lat/lng ×8</p>
          <p className="text-2xl font-semibold">{summary.flagged}</p>
        </div>
        <div className="rounded-2xl bg-ink px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">Total</p>
          <p className="text-2xl font-semibold">{summary.total}</p>
        </div>
      </div>

      <div className="admin-filters mt-4 mb-4 grid gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        <label className="text-xs font-medium text-navy/55">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${selectClass} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-navy/55 md:col-span-2 xl:col-span-1">
          Search
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, phone, assembly"
            className={`${selectClass} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-navy/55">
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="">All statuses</option>
            <option value="present">Present</option>
            <option value="half_day">Half-day</option>
            <option value="pending">Pending punch-in</option>
            <option value="absent">Absent</option>
            <option value="leave">Leave</option>
          </select>
        </label>
        <label className="text-xs font-medium text-navy/55">
          Flag
          <select value={flagFilter} onChange={(e) => setFlagFilter(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="">All</option>
            <option value="flagged">Flagged only</option>
            <option value="not_flagged">Not flagged</option>
          </select>
        </label>
        <label className="text-xs font-medium text-navy/55">
          Designation
          <select value={designation} onChange={(e) => setDesignation(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="">All designations</option>
            {visibleDens.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-navy/55">
          Zone
          <select value={zone} onChange={(e) => setZone(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="">All zones</option>
            {unique(allRows, "zone").map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-navy/55">
          District
          <select value={district} onChange={(e) => setDistrict(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="">All districts</option>
            {unique(allRows, "district").map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-navy/55">
          Assembly
          <select value={assembly} onChange={(e) => setAssembly(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="">All assemblies</option>
            {unique(allRows, "assemblyName").map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <div className="text-xs font-medium text-navy/55">
          Sector
          <div className="mt-1">
            <SearchSelect
              value={sector}
              onChange={setSector}
              options={unique(allRows, "sectorAllotted")}
              placeholder="Search sector allotted"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center md:col-span-3 lg:col-span-4 xl:col-span-8">
          <button
            type="button"
            onClick={downloadZip}
            disabled={zipBusy || !allRows.length}
            className="h-11 rounded-xl bg-teal px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            {zipBusy ? "Preparing PDF ZIP…" : `Download PDF ZIP (${allRows.length} users · ${date})`}
          </button>
          <p className="text-xs text-navy/50">
            One PDF per Halka — file name = Halka code (e.g. DB_JU_Jalandhar Cantt.pdf). Each PDF has that Halka
            summary + full attendance table for the selected date.
          </p>
        </div>
      </div>

      <section className="admin-panel overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Assembly / Sector</th>
                <th className="px-4 py-3">Zone / District</th>
                <th className="px-4 py-3">Punch in</th>
                <th className="px-4 py-3">Punch out</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Flag</th>
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
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.zone || "—"}</p>
                    <p className="text-xs text-navy/50">{r.district || "—"}</p>
                  </td>
                  <td className="px-4 py-3">{fmtTime(r.punchInAt)}</td>
                  <td className="px-4 py-3">{fmtTime(r.punchOutAt)}</td>
                  <td className="px-4 py-3 font-medium">
                    {r.hoursWorked > 0 ? `${r.hoursWorked}h` : "—"}
                    {(r.sessionCount || 0) > 1 ? (
                      <p className="text-[10px] font-normal text-navy/45">{r.sessionCount} sessions</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={r.status}
                      disabled={busy === r.userId}
                      onChange={(e) => requestStatus(r.userId, r.name, e.target.value as AttStatus, r.status)}
                      className={`rounded-xl border border-navy/10 px-2 py-1.5 text-xs font-semibold ${statusClass(r.status)}`}
                    >
                      {r.status === "pending" ? <option value="pending">Pending punch-in</option> : null}
                      <option value="present">Present</option>
                      <option value="half_day">Half-day</option>
                      <option value="absent">Absent</option>
                      <option value="leave">Leave</option>
                    </select>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-navy/40">
                      {r.source === "manual" ? "Manual" : "Auto"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {r.flagged ? (
                      <span className="inline-flex rounded-lg bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800">
                        Flagged
                      </span>
                    ) : (
                      <span className="text-xs text-navy/35">—</span>
                    )}
                    {r.flagged && r.flagSameCount ? (
                      <p className="mt-1 text-[10px] text-violet-700/80">{r.flagSameCount} same checks</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 max-w-[240px] text-xs text-navy/55">
                    {r.flagged && r.flagReason ? (
                      <p className="mb-1 font-medium text-violet-800">{r.flagReason}</p>
                    ) : null}
                    {r.reason}
                  </td>
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

      {pending && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-card">
            <h2 className="text-lg font-semibold">Change attendance status</h2>
            <p className="mt-1 text-sm text-navy/60">
              {pending.name} → <span className="font-semibold">{statusTitle(pending.status)}</span>
            </p>
            <label className="mt-4 block text-xs font-medium text-navy/55">
              Reason (required)
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Why are you changing this status?"
                className="mt-1 w-full rounded-xl border border-navy/10 px-3 py-2 text-sm"
              />
            </label>
            {statusErr && <p className="mt-2 text-sm text-red-600">{statusErr}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setReason("");
                  setStatusErr("");
                }}
                className="admin-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyStatus}
                disabled={busy === pending.userId}
                className="admin-btn-ink disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
