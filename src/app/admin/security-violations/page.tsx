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
  zone: string;
  district: string;
  violationType: string;
  violationLabel: string;
  clientSource: string;
  clientLabel: string;
  action: string;
  detail: string;
  lat: number | null;
  lng: number | null;
  createdAt: string;
};

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function whenIst(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—";
}

function typeBadge(type: string, label: string) {
  const cls =
    type === "vpn"
      ? "bg-violet-50 text-violet-800"
      : type === "mock_gps"
        ? "bg-amber-50 text-amber-900"
        : type === "spoof_app"
          ? "bg-red-50 text-red-800"
          : "bg-navy/5 text-navy/70";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>
  );
}

export default function SecurityViolationsPage() {
  const [date, setDate] = useState(todayIst);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
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
    if (type) params.set("type", type);
    const res = await fetch(`/api/admin/security-violations?${params}`);
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
    "Name",
    "Phone",
    "Designation",
    "Assembly",
    "Zone",
    "District",
    "Violation",
    "Action",
    "Detail",
    "Client",
    "Coordinates",
  ];
  const exportRows = filtered.map((r) => [
    whenIst(r.createdAt),
    r.name,
    r.phone,
    r.designation,
    r.assemblyName,
    r.zone,
    r.district,
    r.violationLabel,
    r.action,
    r.detail,
    r.clientLabel,
    r.lat != null && r.lng != null ? `${r.lat}, ${r.lng}` : "",
  ]);

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Security</p>
      <h1 className="text-2xl font-semibold">VPN / Fake GPS / Spoof apps</h1>
      <p className="mt-1 text-sm text-navy/55">
        Device-level detections from the native app (once per hour while punched in, and on punch block):
        which VPN / fake GPS / spoof app is on the phone (app name + package).
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-navy/45">Violation type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-navy/15 bg-white px-3 py-2 text-sm"
          >
            <option value="">All types</option>
            <option value="vpn">VPN in use</option>
            <option value="mock_gps">Fake GPS (mock location)</option>
            <option value="spoof_app">Spoof app installed</option>
          </select>
        </label>
      </div>

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
        onApply={load}
        onCsv={() => downloadCsv(`security-violations-${date || "all"}`, exportHeaders, exportRows)}
        onPdf={() => downloadPdf(`Security violations · ${date || "all"}`, exportHeaders, exportRows)}
      />

      <section className="admin-panel overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Assembly</th>
                <th className="px-4 py-3">Violation</th>
                <th className="px-4 py-3">Detail</th>
                <th className="px-4 py-3">Client</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className="border-t border-navy/5 hover:bg-[#f7f9fd]">
                  <td className="px-4 py-3 whitespace-nowrap text-sm">{whenIst(r.createdAt)}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-xs text-navy/50">{r.phone}</p>
                    <p className="text-xs text-navy/45">{r.designation}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.assemblyName}</p>
                    <p className="text-xs text-navy/45">
                      {r.zone} · {r.district}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {typeBadge(r.violationType, r.violationLabel)}
                    <p className="mt-1 text-xs text-navy/45 capitalize">{r.action.replace(/_/g, " ")}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[240px] break-all text-sm">{r.detail || "—"}</p>
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
                  <td className="px-4 py-3 text-sm">{r.clientLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <p className="p-8 text-center text-sm text-navy/50">No security violations for this filter.</p>
          )}
        </div>
        {!!filtered.length && (
          <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} />
        )}
      </section>
    </main>
  );
}
