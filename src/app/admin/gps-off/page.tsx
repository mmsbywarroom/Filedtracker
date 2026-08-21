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
};

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default function GpsOffLogsPage() {
  const [date, setDate] = useState(todayIst);
  const [q, setQ] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  async function load() {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (q) params.set("q", q);
    const res = await fetch(`/api/admin/gps-off?${params}`);
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
      <h1 className="text-2xl font-semibold">GPS off logs</h1>
      <p className="mt-1 text-sm text-navy/55">
        Users who were auto punched out because Location / GPS was turned off after punch in.
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
                <th className="px-4 py-3">Last GPS place</th>
                <th className="px-4 py-3">When GPS went off</th>
                <th className="px-4 py-3">Flag</th>
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
                  <td className="px-4 py-3">
                    <p className="max-w-[220px] text-sm">{r.place}</p>
                    {r.lat != null && r.lng != null && (
                      <a
                        className="text-xs font-semibold text-teal"
                        href={`https://maps.google.com/?q=${r.lat},${r.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {r.punchOutAt
                      ? new Date(r.punchOutAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                      Punched out · GPS off
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!logs.length && <p className="p-8 text-center text-sm text-navy/50">No GPS-off punch-outs for this filter.</p>}
        </div>
        {!!logs.length && (
          <PaginationBar page={page} pageSize={pageSize} total={logs.length} onPage={setPage} onPageSize={setPageSize} />
        )}
      </section>
    </main>
  );
}
