"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PaginationBar } from "@/components/PaginationBar";
import { AdminReportToolbar } from "@/components/AdminReportToolbar";
import { downloadCsv, downloadPdf, uniqueSorted } from "@/lib/reportExport";

type Log = {
  id: string;
  when: string;
  userId: string;
  name: string;
  phone: string;
  designation: string;
  assemblyName: string;
  zone: string;
  district: string;
  action: string;
  outcome: string;
  flags: { code: string; label: string }[];
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  sampleCount: number;
  maxSpreadM: number | null;
  detail: string;
  attendanceId: string | null;
};

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function whenIst(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—";
}

function actionLabel(action: string) {
  if (action === "punch_in") return "Punch in";
  if (action === "punch_out") return "Punch out";
  return action;
}

export default function GpsSpoofLogsPage() {
  const [date, setDate] = useState(todayIst);
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);
  const [zone, setZone] = useState("");
  const [district, setDistrict] = useState("");
  const [designation, setDesignation] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  async function load() {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (q) params.set("q", q);
    if (outcome) params.set("outcome", outcome);
    const res = await fetch(`/api/admin/gps-spoof?${params}`);
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
      return true;
    });
  }, [logs, zone, district, designation]);

  const pageRows = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  const exportHeaders = [
    "When",
    "User",
    "Phone",
    "Designation",
    "Assembly",
    "Zone",
    "District",
    "Action",
    "Outcome",
    "Flags",
    "Detail",
    "Samples",
    "Max spread (m)",
    "Coordinates",
  ];
  const exportRows = filtered.map((r) => [
    whenIst(r.when),
    r.name,
    r.phone,
    r.designation,
    r.assemblyName,
    r.zone,
    r.district,
    actionLabel(r.action),
    r.outcome,
    r.flags.map((f) => f.label).join("; "),
    r.detail,
    String(r.sampleCount),
    r.maxSpreadM != null ? String(Math.round(r.maxSpreadM)) : "",
    r.lat != null && r.lng != null ? `${r.lat}, ${r.lng}` : "",
  ]);

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Alerts</p>
      <h1 className="text-2xl font-semibold">Fake GPS / spoof logs</h1>
      <p className="mt-1 text-sm text-navy/55">
        Users blocked or flagged for fake GPS apps, weak GPS, pinned locations, or almost zero movement after punch-in.
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
        reason={outcome}
        onReason={(v) => {
          setOutcome(v);
          setPage(1);
        }}
        reasons={[
          { value: "blocked", label: "Blocked" },
          { value: "flagged", label: "Flagged only" },
        ]}
        onApply={load}
        onCsv={() => downloadCsv(`gps-spoof-${date || "all"}`, exportHeaders, exportRows)}
        onPdf={() => downloadPdf(`GPS spoof logs · ${date || "all"}`, exportHeaders, exportRows)}
      />

      <section className="admin-panel overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Location</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className="border-t border-navy/5 hover:bg-[#f7f9fd]">
                  <td className="px-4 py-3 text-sm">{whenIst(r.when)}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-xs text-navy/50">{r.phone}</p>
                    <p className="text-xs text-navy/45">
                      {r.designation} · {r.assemblyName}
                    </p>
                    <p className="text-xs text-navy/40">
                      {r.zone} · {r.district}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{actionLabel(r.action)}</p>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        r.outcome === "blocked" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {r.outcome === "blocked" ? "Blocked" : "Flagged"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[280px] text-sm">{r.detail}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.flags.map((f) => (
                        <span key={f.code} className="rounded bg-navy/5 px-1.5 py-0.5 text-[10px] font-medium text-navy/60">
                          {f.label}
                        </span>
                      ))}
                    </div>
                    {r.sampleCount > 0 && (
                      <p className="mt-1 text-xs text-navy/45">
                        {r.sampleCount} GPS readings
                        {r.maxSpreadM != null ? ` · spread ${Math.round(r.maxSpreadM)} m` : ""}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {r.lat != null && r.lng != null ? (
                      <a
                        className="text-xs font-semibold text-teal"
                        href={`https://maps.google.com/?q=${r.lat},${r.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                      </a>
                    ) : (
                      "—"
                    )}
                    {r.attendanceId && (
                      <p className="mt-1">
                        <Link href={`/admin/users/${r.userId}`} className="text-xs font-semibold text-teal">
                          View footprint
                        </Link>
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <p className="p-8 text-center text-sm text-navy/50">No fake GPS alerts for this filter.</p>
          )}
        </div>
        {!!filtered.length && (
          <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} />
        )}
      </section>
    </main>
  );
}
