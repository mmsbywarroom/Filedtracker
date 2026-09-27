"use client";

import { useEffect, useState } from "react";
import { CALL_OUTCOMES } from "@/lib/callList";
import { downloadCsv, downloadPdf } from "@/lib/reportExport";

type Bucket = {
  zone: string;
  district: string;
  halka: string;
  total: number;
  dialed: number;
  notAttempted: number;
  connected: number;
  callComplete: number;
  notConnected: number;
  byStatus: Record<string, number>;
  coming: number;
  notComing: number;
  othersYes: number;
  othersNo: number;
};

const PROGRESS = ["Total calls", "Dialed", "Not attempted", "Connected", "Call complete", "Not connected"] as const;

export default function CallDashboardPage() {
  const [total, setTotal] = useState<Bucket | null>(null);
  const [rows, setRows] = useState<Bucket[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/call-contacts/dashboard");
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not load the call dashboard.");
        return;
      }
      setTotal(data.total || null);
      setRows(data.rows || []);
    })();
  }, []);

  const tableRows = total ? [total, ...rows] : rows;

  function flat(row: Bucket, index: number) {
    return [
      index === 0 && row.zone === "Total" ? "" : index,
      row.zone,
      row.district,
      row.halka,
      row.total,
      row.dialed,
      row.notAttempted,
      row.connected,
      row.callComplete,
      row.notConnected,
      ...CALL_OUTCOMES.map((s) => row.byStatus?.[s.value] || 0),
      row.coming,
      row.notComing,
      row.othersYes,
    ];
  }

  const headers = [
    "Sr. No.",
    "Zone",
    "District",
    "Vidhansabha",
    ...PROGRESS,
    ...CALL_OUTCOMES.map((s) => s.label),
    "Coming",
    "Not coming",
    "People with them",
  ];

  function exportRows() {
    return tableRows.map((row, index) => flat(row, index));
  }

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">People</p>
      <h1 className="text-2xl font-semibold text-ink">Call dashboard</h1>
      <p className="mt-1 max-w-3xl text-sm text-navy/55">
        One row per zone, district, and Vidhansabha. Connected means the person answered. Not connected means the call did not go through.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="admin-btn-secondary"
          disabled={!tableRows.length}
          onClick={() => downloadCsv("call-dashboard", headers, exportRows())}
        >
          Download CSV
        </button>
        <button
          type="button"
          className="admin-btn-ink"
          disabled={!tableRows.length}
          onClick={() =>
            downloadPdf("Call dashboard", headers, exportRows(), {
              subtitle: "Zone, district, and Vidhansabha call counts",
              tableAccent: "#12305A",
              tableAccentText: "#ffffff",
            })
          }
        >
          Download PDF
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {!total && !error ? <p className="mt-4 text-sm text-navy/50">Loading call dashboard…</p> : null}
      {total ? (
        <section className="admin-panel mt-4 !overflow-visible">
          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
              <thead>
                <tr>
                  <th className="sticky top-0 z-20 bg-[#12305A] px-3 py-2 text-white" colSpan={4}>
                    Place
                  </th>
                  <th className="sticky top-0 z-20 bg-[#1d4ed8] px-3 py-2 text-white" colSpan={PROGRESS.length}>
                    Calls
                  </th>
                  <th className="sticky top-0 z-20 bg-[#0f766e] px-3 py-2 text-white" colSpan={CALL_OUTCOMES.length}>
                    Call status
                  </th>
                  <th className="sticky top-0 z-20 bg-[#15803d] px-3 py-2 text-white" colSpan={2}>
                    Attending
                  </th>
                  <th className="sticky top-0 z-20 bg-[#7c3aed] px-3 py-2 text-white" colSpan={1}>
                    With them
                  </th>
                </tr>
                <tr>
                  {headers.map((label) => (
                    <th
                      key={label}
                      className="sticky top-[33px] z-20 whitespace-nowrap bg-[#eef3fb] px-3 py-2 shadow-[0_1px_0_rgba(18,48,90,0.12)]"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, index) => {
                  const isTotal = index === 0;
                  return (
                    <tr key={`${row.zone}-${row.district}-${row.halka}`} className={isTotal ? "bg-[#fff6d4] font-semibold" : "border-t border-navy/5"}>
                      <td className="px-3 py-2">{isTotal ? "" : index}</td>
                      <td className="px-3 py-2">{row.zone}</td>
                      <td className="px-3 py-2">{isTotal ? "" : row.district}</td>
                      <td className="px-3 py-2">{isTotal ? "" : row.halka}</td>
                      <td className="px-3 py-2">{row.total}</td>
                      <td className="px-3 py-2">{row.dialed}</td>
                      <td className="px-3 py-2">{row.notAttempted}</td>
                      <td className="px-3 py-2">{row.connected}</td>
                      <td className="px-3 py-2">{row.callComplete}</td>
                      <td className="px-3 py-2">{row.notConnected}</td>
                      {CALL_OUTCOMES.map((status) => (
                        <td key={status.value} className="px-3 py-2" style={{ color: status.color }}>
                          {row.byStatus?.[status.value] || 0}
                        </td>
                      ))}
                      <td className="px-3 py-2">{row.coming}</td>
                      <td className="px-3 py-2">{row.notComing}</td>
                      <td className="px-3 py-2">{row.othersYes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
