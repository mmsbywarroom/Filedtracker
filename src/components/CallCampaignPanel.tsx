"use client";

import { useEffect, useState } from "react";
import { CALL_OUTCOMES } from "@/lib/callList";

type Summary = {
  assigned: number;
  called: number;
  pending: number;
  coming: number;
  notComing: number;
  withOthers: number;
  byStatus: Record<string, number>;
};

type Row = {
  id: string;
  callerName: string;
  callerPhone: string;
  callerDesignation: string;
  personName: string;
  mobile: string;
  vehicleNumber: string;
  status: string;
  statusLabel: string;
  attending: string;
  companions: string;
  updatedAt: string;
};

export function CallCampaignPanel({ showDetails = true, reloadToken = 0 }: { showDetails?: boolean; reloadToken?: number }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/call-contacts/results");
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setError(data.error || "Could not load call summary.");
        return;
      }
      setSummary(data.summary || null);
      setRows(data.rows || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  if (error) return <p className="mt-4 text-sm text-red-700">{error}</p>;
  if (!summary) return <p className="mt-4 text-sm text-navy/50">Loading call summary…</p>;

  return (
    <section className="mt-5">
      <h2 className="text-sm font-semibold text-ink">Call campaign</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Numbers assigned" value={summary.assigned} />
        <Stat label="Calls done" value={summary.called} />
        <Stat label="Not called yet" value={summary.pending} />
        <Stat label="Coming" value={summary.coming} />
        <Stat label="Not coming" value={summary.notComing} />
        <Stat label="Others in the car" value={summary.withOthers} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {CALL_OUTCOMES.map((status) => (
          <span
            key={status.value}
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: status.color, color: status.text }}
          >
            {status.label}: {summary.byStatus?.[status.value] || 0}
          </span>
        ))}
      </div>
      {showDetails ? (
        <div className="admin-panel mt-4 overflow-hidden">
          <div className="max-h-[420px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Caller",
                    "Caller mobile",
                    "Person",
                    "Mobile",
                    "Vehicle",
                    "Call status",
                    "Attending",
                    "Others in car",
                    "Updated",
                  ].map((h) => (
                    <th key={h} className="sticky top-0 z-10 bg-[#eef3fb] px-3 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const color = CALL_OUTCOMES.find((s) => s.value === row.status);
                  return (
                    <tr key={row.id} className="border-t border-navy/5">
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.callerName}</div>
                        <div className="text-xs text-navy/45">{row.callerDesignation}</div>
                      </td>
                      <td className="px-3 py-2">{row.callerPhone}</td>
                      <td className="px-3 py-2 font-medium">{row.personName}</td>
                      <td className="px-3 py-2">{row.mobile}</td>
                      <td className="px-3 py-2">{row.vehicleNumber || "—"}</td>
                      <td className="px-3 py-2">
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{ background: color?.color || "#64748b", color: color?.text || "#fff" }}
                        >
                          {row.statusLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2">{attendingLabel(row.attending)}</td>
                      <td className="px-3 py-2">{companionsLabel(row.companions)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-navy/60">
                        {new Date(row.updatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length ? <p className="p-6 text-sm text-navy/50">No call results saved yet.</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-navy/10 bg-white px-4 py-3">
      <p className="text-xs text-navy/50">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function attendingLabel(value: string) {
  if (value === "coming") return "Coming";
  if (value === "not_coming") return "Not coming";
  return "—";
}

function companionsLabel(value: string) {
  if (value === "yes") return "Yes";
  if (value === "no") return "No";
  return "—";
}
