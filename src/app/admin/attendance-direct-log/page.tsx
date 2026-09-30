"use client";

import { useEffect, useMemo, useState } from "react";
import { PaginationBar } from "@/components/PaginationBar";

type LogRow = {
  id: string;
  date: string;
  previousStatus: string | null;
  newStatus: string;
  note: string;
  changedByName: string;
  changedByEmail: string;
  changedByLevel: string;
  createdAt: string;
  user: {
    name: string;
    phone: string;
    designation: string;
    assemblyName: string;
    sectorAllotted: string;
    zone: string;
    district: string;
    cluster: string;
  };
};

const STATUS_KEYS = ["present", "half_day", "leave", "absent", "in_progress"] as const;

function statusKey(s: string | null) {
  if (s === "pending") return "in_progress";
  return s || "";
}

function statusLabel(s: string | null) {
  if (!s) return "—";
  if (s === "present") return "Present";
  if (s === "half_day") return "Half-day";
  if (s === "leave") return "Leave";
  if (s === "absent") return "Absent";
  if (s === "pending" || s === "in_progress") return "In progress";
  return s;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

const selectClass = "h-11 w-full rounded-xl border border-navy/15 bg-white px-3 text-sm shadow-sm";

export default function AttendanceDirectLogPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [summary, setSummary] = useState({ total: 0, byCluster: 0, byDlc: 0 });
  const [date, setDate] = useState("");
  const [level, setLevel] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [err, setErr] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (level) params.set("level", level);
    fetch(`/api/admin/attendance-direct-changes?${params}`)
      .then(async (res) => {
        if (res.status === 401) {
          window.location.href = "/admin/login";
          return null;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not load change log.");
        return data;
      })
      .then((data) => {
        if (!data) return;
        setRows(data.rows || []);
        setSummary(data.summary || { total: 0, byCluster: 0, byDlc: 0 });
        setErr("");
        setPage(1);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Could not load change log."));
  }, [date, level]);

  const filtered = useMemo(() => {
    const text = q.trim().toLowerCase();
    if (!text) return rows;
    return rows.filter((r) =>
      `${r.user.name} ${r.user.phone} ${r.user.designation} ${r.user.assemblyName} ${r.user.sectorAllotted} ${r.changedByName} ${r.note}`
        .toLowerCase()
        .includes(text)
    );
  }, [rows, q]);

  const shownSummary = useMemo(() => {
    if (!q.trim()) return summary;
    return {
      total: filtered.length,
      byCluster: filtered.filter((r) => r.changedByLevel === "Cluster").length,
      byDlc: filtered.filter((r) => r.changedByLevel === "DLC").length,
    };
  }, [filtered, q, summary]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const key of STATUS_KEYS) counts[key] = 0;
    for (const row of filtered) {
      const key = statusKey(row.newStatus);
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [filtered]);

  const byPerson = useMemo(() => {
    const map = new Map<string, { name: string; level: string; total: number; byStatus: Record<string, number> }>();
    for (const row of filtered) {
      const name = row.changedByName || row.changedByEmail || "Unknown";
      const key = `${name}|${row.changedByLevel}`;
      const current = map.get(key) || { name, level: row.changedByLevel, total: 0, byStatus: {} };
      current.total += 1;
      const status = statusKey(row.newStatus);
      current.byStatus[status] = (current.byStatus[status] || 0) + 1;
      map.set(key, current);
    }
    const list: { name: string; level: string; total: number; byStatus: Record<string, number> }[] = [];
    map.forEach((value) => list.push(value));
    return list.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [filtered]);

  const statusColumns = useMemo(() => {
    const extras = Object.keys(statusCounts).filter((key) => statusCounts[key] > 0 && !STATUS_KEYS.some((known) => known === key));
    return [...STATUS_KEYS, ...extras];
  }, [statusCounts]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Attendance</p>
      <h1 className="text-2xl font-semibold text-ink">DLC and Cluster change log</h1>
      <p className="mt-1 max-w-3xl text-sm text-navy/55">
        Attendance updates applied directly by a DLC or Cluster admin. No approval is required. Counts follow your access.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-ink px-5 py-4 text-white shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/75">Total changes</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{shownSummary.total}</p>
        </div>
        <div className="rounded-2xl bg-[#12305A] px-5 py-4 text-white shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/75">By Cluster</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{shownSummary.byCluster}</p>
        </div>
        <div className="rounded-2xl bg-teal px-5 py-4 text-white shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/75">By DLC</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{shownSummary.byDlc}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {statusColumns.map((key) => (
          <div key={key} className="rounded-2xl border border-navy/10 bg-white px-4 py-3 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wider text-navy/50">{statusLabel(key)}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{statusCounts[key] || 0}</p>
          </div>
        ))}
      </div>

      <section className="admin-panel mt-4 overflow-hidden">
        <div className="border-b border-navy/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Who changed what</h2>
          <p className="text-xs text-navy/50">Each admin’s change count, split by the new attendance status.</p>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
              <tr>
                <th className="px-4 py-3">Changed by</th>
                <th className="px-4 py-3">Total</th>
                {statusColumns.map((key) => (
                  <th key={key} className="px-4 py-3">{statusLabel(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byPerson.map((person) => (
                <tr key={`${person.name}-${person.level}`} className="border-t border-navy/5">
                  <td className="px-4 py-3">
                    <p className="font-medium">{person.name}</p>
                    <p className="text-xs text-navy/45">{person.level}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums">{person.total}</td>
                  {statusColumns.map((key) => (
                    <td key={key} className="px-4 py-3 tabular-nums">{person.byStatus[key] || 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!byPerson.length ? <p className="p-6 text-sm text-navy/50">No changes in this view.</p> : null}
        </div>
      </section>

      <div className="mt-4 mb-4 grid gap-3 md:grid-cols-3">
        <label className="text-xs font-medium text-navy/55">
          Attendance date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${selectClass} mt-1`} />
        </label>
        <label className="text-xs font-medium text-navy/55">
          Changed by
          <select value={level} onChange={(e) => setLevel(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="">Cluster and DLC</option>
            <option value="Cluster">Cluster</option>
            <option value="DLC">DLC</option>
          </select>
        </label>
        <label className="text-xs font-medium text-navy/55">
          Search
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Name, phone, assembly, remark"
            className={`${selectClass} mt-1`}
          />
        </label>
      </div>

      {err ? <p className="mb-3 text-sm text-red-600">{err}</p> : null}

      <section className="admin-panel overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
              <tr>
                <th className="px-4 py-3">Attendance date</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Assembly / Sector</th>
                <th className="px-4 py-3">Previous</th>
                <th className="px-4 py-3">New</th>
                <th className="px-4 py-3">Remark</th>
                <th className="px-4 py-3">Changed by</th>
                <th className="px-4 py-3">Changed at</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className="border-t border-navy/5 align-top hover:bg-[#f7f9fd]">
                  <td className="px-4 py-3 whitespace-nowrap">{fmtDate(r.date)}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{r.user.name}</p>
                    <p className="text-xs text-navy/50">{r.user.phone}</p>
                    <p className="text-xs text-navy/45">{r.user.designation}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{r.user.assemblyName}</p>
                    <p className="text-xs text-navy/50">{r.user.sectorAllotted || "—"}</p>
                    <p className="text-xs text-navy/40">
                      {r.user.zone} / {r.user.district}
                    </p>
                  </td>
                  <td className="px-4 py-3">{statusLabel(r.previousStatus)}</td>
                  <td className="px-4 py-3 font-medium">{statusLabel(r.newStatus)}</td>
                  <td className="px-4 py-3 max-w-[240px]">{r.note}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.changedByName || r.changedByEmail}</p>
                    <p className="text-xs text-navy/45">{r.changedByLevel}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-navy/60">{fmtDateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!pageRows.length ? <p className="p-6 text-sm text-navy/50">No direct attendance changes in this view.</p> : null}
        </div>
      </section>

      <div className="mt-3">
        <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} />
      </div>
    </main>
  );
}
