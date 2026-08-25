"use client";

import { useEffect, useMemo, useState } from "react";
import { PaginationBar } from "@/components/PaginationBar";
import { AdminReportToolbar } from "@/components/AdminReportToolbar";
import { downloadCsv, downloadPdf, uniqueSorted } from "@/lib/reportExport";

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
  reason?: string | null;
};

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function whenIst(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—";
}

export default function AutoPunchOutLogsPage() {
  const [date, setDate] = useState(todayIst);
  const [q, setQ] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);
  const [zone, setZone] = useState("");
  const [district, setDistrict] = useState("");
  const [designation, setDesignation] = useState("");
  const [reason, setReason] = useState("");
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

  const zones = useMemo(() => uniqueSorted(logs.map((r) => r.zone)), [logs]);
  const districts = useMemo(
    () => uniqueSorted(logs.filter((r) => !zone || r.zone === zone).map((r) => r.district)),
    [logs, zone]
  );
  const designations = useMemo(() => uniqueSorted(logs.map((r) => r.designation)), [logs]);

  const filtered = useMemo(() => {
    return logs.filter((r) => {
      if (zone && r.zone !== zone) return false;
      if (district && r.district !== district) return false;
      if (designation && r.designation !== designation) return false;
      if (reason && (r.reason || "auto_12h") !== reason) return false;
      return true;
    });
  }, [logs, zone, district, designation, reason]);

  const pageRows = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  const exportHeaders = [
    "Name",
    "Phone",
    "Designation",
    "Assembly",
    "Sector",
    "Zone",
    "District",
    "Punch in",
    "Auto punch out",
    "Last GPS",
    "Reason",
  ];
  const exportRows = filtered.map((r) => [
    r.name,
    r.phone,
    r.designation,
    r.assemblyName,
    r.sectorAllotted,
    r.zone,
    r.district,
    whenIst(r.punchInAt),
    whenIst(r.punchOutAt),
    r.lat != null && r.lng != null ? `${r.lat}, ${r.lng}` : "",
    r.why || "Auto · 12 hours",
  ]);

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Alerts</p>
      <h1 className="text-2xl font-semibold">Auto punch-out logs</h1>
      <p className="mt-1 text-sm text-navy/55">
        Users who punched in but did not punch out — system closed the session after 12 hours. Shown for users in your
        scope.
      </p>

      <AdminReportToolbar
        date={date}
        onDate={setDate}
        q={q}
        onQ={setQ}
        zone={zone}
        onZone={(v) => {
          setZone(v);
          setDistrict("");
          setPage(1);
        }}
        zones={zones}
        district={district}
        onDistrict={(v) => {
          setDistrict(v);
          setPage(1);
        }}
        districts={districts}
        designation={designation}
        onDesignation={(v) => {
          setDesignation(v);
          setPage(1);
        }}
        designations={designations}
        reason={reason}
        onReason={(v) => {
          setReason(v);
          setPage(1);
        }}
        reasons={[
          { value: "auto_12h", label: "Auto · 12 hours" },
          { value: "auto_geofence", label: "Auto · left 1000 m boundary" },
        ]}
        onApply={load}
        onCsv={() => downloadCsv(`auto-punch-out-${date || "all"}`, exportHeaders, exportRows)}
        onPdf={() => downloadPdf(`Auto punch-out logs · ${date || "all"}`, exportHeaders, exportRows)}
      />

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
                  <td className="px-4 py-3 text-sm">{whenIst(r.punchInAt)}</td>
                  <td className="px-4 py-3 text-sm">
                    {whenIst(r.punchOutAt)}
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
          {!filtered.length && (
            <p className="p-8 text-center text-sm text-navy/50">No auto punch-outs for this filter.</p>
          )}
        </div>
        {!!filtered.length && (
          <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} />
        )}
      </section>
    </main>
  );
}
