"use client";

import { useEffect, useState } from "react";
import { PaginationBar } from "@/components/PaginationBar";

type Log = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  designation: string;
  assemblyName: string;
  sectorAllotted: string;
  zone: string;
  district: string;
  punchInAt: string;
  punchOutAt: string | null;
  lat: number | null;
  lng: number | null;
  place: string;
  why: string;
};

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default function AutoPunchOutLogsPage() {
  const [date, setDate] = useState(todayIst);
  const [q, setQ] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  async function load() {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (q) params.set("q", q);
    const res = await fetch(`/api/admin/auto-punch-out?${params}`);
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const data = await res.json();
    setLogs(data.logs || []);
    setPage(1);
  }

  useEffect(() => {
    load();
  }, []);

  const pageRows = logs.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Alerts</p>
      <h1 className="text-2xl font-semibold">Auto punch-out logs</h1>
      <p className="mt-1 text-sm text-navy/55">
        Users who punched in but did not punch out — system closed the session after 12 hours. Shown for users in your scope.
      </p>

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
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, number, assembly"
          className="h-11 min-w-[220px] flex-1 rounded-xl border border-navy/10 px-3 text-sm"
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
                <th className="px-4 py-3">Auto punch out</th>
                <th className="px-4 py-3">Why</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className="border-t border-navy/5 hover:bg-[#f7f9fd]">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-xs text-navy/50">{r.phone}</p>
                    <p className="text-xs text-navy/45">{r.designation}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.assemblyName}</p>
                    <p className="text-xs text-navy/50">{r.sectorAllotted}</p>
                    <p className="text-xs text-navy/45">
                      {r.zone} · {r.district}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {new Date(r.punchInAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.punchOutAt
                      ? new Date(r.punchOutAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                      : "—"}
                    {r.lat != null && r.lng != null && (
                      <a
                        className="mt-1 block text-xs font-semibold text-teal"
                        href={`https://maps.google.com/?q=${r.lat},${r.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Last GPS
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      Auto · 12 hours
                    </span>
                    <p className="mt-1 max-w-[220px] text-xs text-navy/55">{r.why}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!logs.length && (
            <p className="p-8 text-center text-sm text-navy/50">No auto punch-outs for this filter.</p>
          )}
        </div>
        {!!logs.length && (
          <PaginationBar page={page} pageSize={pageSize} total={logs.length} onPage={setPage} onPageSize={setPageSize} />
        )}
      </section>
    </main>
  );
}
