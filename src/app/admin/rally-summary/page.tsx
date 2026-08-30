"use client";

import { useEffect, useRef, useState } from "react";
import { downloadCsv, downloadPdf } from "@/lib/reportExport";

type Counts = {
  users: number;
  started: number;
  pending: number;
  reached: number;
  m30: number;
  h1: number;
  h2: number;
  h2_5: number;
  over: number;
  uniqueVehicles: number;
  heads: number;
  totalVehicles?: number;
  key?: string;
};

type Metric =
  | "users"
  | "uniqueVehicles"
  | "started"
  | "pending"
  | "reached"
  | "m30"
  | "h1"
  | "h2"
  | "h2_5"
  | "over"
  | "heads";

type GroupBy = "zone" | "district" | "ac" | "vehicle";

type Detail = {
  id: string;
  name: string;
  phone: string;
  zone: string;
  district: string;
  acName: string;
  villageWard: string;
  vehicleNo: string;
  vehicleType: string;
  headCount: number;
  lat: number | null;
  lng: number | null;
  etaLabel: string;
  remainingLabel: string;
};

const METRIC_LABELS: Record<Metric, string> = {
  users: "Users / vehicles",
  uniqueVehicles: "Unique vehicles",
  started: "Journey started",
  pending: "Pending",
  reached: "Reached venue",
  m30: "In 30 min",
  h1: "In 1 hour",
  h2: "In 2 hours",
  h2_5: "2–2.5 hours",
  over: "Above 2.5 hours",
  heads: "Head count",
};

const GROUP_LABELS: Record<GroupBy, string> = {
  zone: "Zone",
  district: "District",
  ac: "AC name",
  vehicle: "Vehicle",
};

const BREAKDOWN_HEADERS = ["Name", "Users", "Unique veh", "Heads", "Started", "Pending", "Reached", "30m", "1h", "2h", "2–2.5h", ">2.5h"];

function breakdownRows(rows: Counts[]) {
  return rows.map((r) => [
    r.key || "",
    r.users,
    r.uniqueVehicles,
    r.heads || 0,
    r.started,
    r.pending,
    r.reached,
    r.m30,
    r.h1,
    r.h2,
    r.h2_5,
    r.over,
  ]);
}

function ExportBtns({ title, headers, rows }: { title: string; headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="flex gap-2">
      <button type="button" className="admin-btn-secondary" onClick={() => downloadCsv(title.replace(/\s+/g, "-").toLowerCase(), headers, rows)}>
        CSV
      </button>
      <button type="button" className="admin-btn-secondary" onClick={() => downloadPdf(title, headers, rows)}>
        PDF
      </button>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  className,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  className: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-5 py-4 text-left text-white shadow-card transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-teal ${active ? "ring-2 ring-white" : ""} ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-white/75">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-white/70">{hint}</p>
    </button>
  );
}

function CellBtn({ value, active, onClick }: { value: number; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-1 py-0.5 underline-offset-2 hover:underline ${active ? "bg-teal/10 font-semibold underline ring-1 ring-teal/30" : ""}`}
    >
      {value}
    </button>
  );
}

export default function RallySummaryPage() {
  const [data, setData] = useState<{
    rally: { name: string } | null;
    totals: Counts;
    byZone: Counts[];
    byDistrict: Counts[];
    byAc: Counts[];
    byVehicle: Counts[];
  } | null>(null);
  const [metric, setMetric] = useState<Metric | null>(null);
  const [group, setGroup] = useState<{ groupBy: GroupBy; groupValue: string } | null>(null);
  const [details, setDetails] = useState<Detail[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailRef = useRef<HTMLElement>(null);

  async function load() {
    const res = await fetch("/api/admin/rally/summary", { cache: "no-store" });
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    setData(await res.json());
  }

  async function openMetric(m: Metric, g?: { groupBy: GroupBy; groupValue: string } | null) {
    setMetric(m);
    setGroup(g || null);
    setDetailLoading(true);
    const params = new URLSearchParams({ metric: m });
    if (g) {
      params.set("groupBy", g.groupBy);
      params.set("groupValue", g.groupValue);
    }
    const res = await fetch(`/api/admin/rally/summary/details?${params}`);
    const json = await res.json();
    setDetails(json.rows || []);
    setDetailLoading(false);
    window.setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 20000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <main className="px-4 py-6">Loading…</main>;

  const t = data.totals;
  const overallExport = [
    ["Users / vehicles", t.totalVehicles ?? t.users],
    ["Unique vehicles", t.uniqueVehicles],
    ["Head count", t.heads || 0],
    ["Journey started", t.started],
    ["Pending", t.pending],
    ["Reached venue", t.reached],
    ["In 30 min", t.m30],
    ["In 1 hour", t.h1],
    ["In 2 hours", t.h2],
    ["2–2.5 hours", t.h2_5],
    ["Above 2.5 hours", t.over],
  ];

  function Breakdown({ title, rows, groupBy }: { title: string; rows: Counts[]; groupBy: GroupBy }) {
    return (
      <section className="admin-panel mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <ExportBtns title={`rally-${title}`} headers={BREAKDOWN_HEADERS} rows={breakdownRows(rows)} />
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-[900px]">
            <thead>
              <tr>
                {BREAKDOWN_HEADERS.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="font-medium">{r.key}</td>
                  <td>
                    <CellBtn value={r.users} active={metric === "users" && group?.groupValue === r.key} onClick={() => openMetric("users", { groupBy, groupValue: r.key || "" })} />
                  </td>
                  <td>
                    <CellBtn value={r.uniqueVehicles} active={metric === "uniqueVehicles" && group?.groupValue === r.key} onClick={() => openMetric("uniqueVehicles", { groupBy, groupValue: r.key || "" })} />
                  </td>
                  <td>
                    <CellBtn value={r.heads || 0} active={metric === "heads" && group?.groupValue === r.key} onClick={() => openMetric("heads", { groupBy, groupValue: r.key || "" })} />
                  </td>
                  <td>
                    <CellBtn value={r.started} active={metric === "started" && group?.groupValue === r.key} onClick={() => openMetric("started", { groupBy, groupValue: r.key || "" })} />
                  </td>
                  <td>
                    <CellBtn value={r.pending} active={metric === "pending" && group?.groupValue === r.key} onClick={() => openMetric("pending", { groupBy, groupValue: r.key || "" })} />
                  </td>
                  <td>
                    <CellBtn value={r.reached} active={metric === "reached" && group?.groupValue === r.key} onClick={() => openMetric("reached", { groupBy, groupValue: r.key || "" })} />
                  </td>
                  <td>
                    <CellBtn value={r.m30} active={metric === "m30" && group?.groupValue === r.key} onClick={() => openMetric("m30", { groupBy, groupValue: r.key || "" })} />
                  </td>
                  <td>
                    <CellBtn value={r.h1} active={metric === "h1" && group?.groupValue === r.key} onClick={() => openMetric("h1", { groupBy, groupValue: r.key || "" })} />
                  </td>
                  <td>
                    <CellBtn value={r.h2} active={metric === "h2" && group?.groupValue === r.key} onClick={() => openMetric("h2", { groupBy, groupValue: r.key || "" })} />
                  </td>
                  <td>
                    <CellBtn value={r.h2_5} active={metric === "h2_5" && group?.groupValue === r.key} onClick={() => openMetric("h2_5", { groupBy, groupValue: r.key || "" })} />
                  </td>
                  <td>
                    <CellBtn value={r.over} active={metric === "over" && group?.groupValue === r.key} onClick={() => openMetric("over", { groupBy, groupValue: r.key || "" })} />
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-navy/50">
                    No data
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  const detailHeaders = ["Name", "Number", "Zone", "District", "AC", "Vehicle", "Heads", "Lat", "Lng", "ETA", "Status"];
  const detailExport = details.map((d) => [
    d.name,
    d.phone,
    d.zone,
    d.district,
    d.acName,
    d.vehicleNo,
    d.headCount,
    d.lat ?? "",
    d.lng ?? "",
    d.etaLabel,
    d.remainingLabel,
  ]);

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="admin-page-kicker">Rally</p>
      <h1 className="admin-page-title">Rally summary</h1>
      <p className="admin-page-sub">{data.rally ? data.rally.name : "No active rally"} · tap a card or number like the dashboard</p>

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Overall</h2>
          <ExportBtns title="rally-overall" headers={["Metric", "Count"]} rows={overallExport} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <Stat className="bg-[#12305A]" label="Users / vehicles" value={t.totalVehicles ?? t.users} hint="Tap to list" active={metric === "users" && !group} onClick={() => openMetric("users")} />
          <Stat className="bg-teal" label="Unique vehicles" value={t.uniqueVehicles} hint="Tap to list" active={metric === "uniqueVehicles" && !group} onClick={() => openMetric("uniqueVehicles")} />
          <Stat className="bg-violet-700" label="Head count" value={t.heads || 0} hint="People in photos" active={metric === "heads" && !group} onClick={() => openMetric("heads")} />
          <Stat className="bg-[#c45c12]" label="Journey started" value={t.started} hint="Photo captured" active={metric === "started" && !group} onClick={() => openMetric("started")} />
          <Stat className="bg-amber-600" label="Pending" value={t.pending} hint="On the way" active={metric === "pending" && !group} onClick={() => openMetric("pending")} />
          <Stat className="bg-emerald-700" label="Reached venue" value={t.reached} hint="Arrived" active={metric === "reached" && !group} onClick={() => openMetric("reached")} />
          <Stat className="bg-sky-700" label="In 30 min" value={t.m30} hint="ETA ≤ 30m" active={metric === "m30" && !group} onClick={() => openMetric("m30")} />
          <Stat className="bg-indigo-700" label="In 1 hour" value={t.h1} hint="30m–1h" active={metric === "h1" && !group} onClick={() => openMetric("h1")} />
          <Stat className="bg-[#1A56C4]" label="In 2 hours" value={t.h2} hint="1–2h" active={metric === "h2" && !group} onClick={() => openMetric("h2")} />
          <Stat className="bg-rose-600" label="2–2.5 hours" value={t.h2_5} hint="2–2.5h" active={metric === "h2_5" && !group} onClick={() => openMetric("h2_5")} />
          <Stat className="bg-ink" label="Above 2.5 hours" value={t.over} hint="> 2.5h" active={metric === "over" && !group} onClick={() => openMetric("over")} />
        </div>
      </section>

      <Breakdown title="Zone wise" rows={data.byZone} groupBy="zone" />
      <Breakdown title="District wise" rows={data.byDistrict} groupBy="district" />
      <Breakdown title="AC name wise" rows={data.byAc} groupBy="ac" />
      <Breakdown title="Unique vehicle wise" rows={data.byVehicle} groupBy="vehicle" />

      {metric && (
        <section ref={detailRef} className="admin-panel mt-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy/5 bg-[#12305A] px-4 py-3 text-white">
            <h2 className="font-semibold">
              {METRIC_LABELS[metric]}
              {group ? ` · ${GROUP_LABELS[group.groupBy]}: ${group.groupValue}` : ""}
            </h2>
            {!detailLoading && details.length > 0 && (
              <div className="flex gap-2">
                <button type="button" className="rounded-lg border border-white/30 px-3 py-1.5 text-sm" onClick={() => downloadCsv("rally-detail", detailHeaders, detailExport)}>
                  CSV
                </button>
                <button type="button" className="rounded-lg border border-white/30 px-3 py-1.5 text-sm" onClick={() => downloadPdf("Rally detail", detailHeaders, detailExport)}>
                  PDF
                </button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            {detailLoading ? (
              <p className="px-4 py-8 text-sm text-navy/50">Loading…</p>
            ) : (
              <table className="min-w-[960px]">
                <thead>
                  <tr>
                    {detailHeaders.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {details.map((d) => (
                    <tr key={d.id}>
                      <td className="font-medium">{d.name}</td>
                      <td>{d.phone}</td>
                      <td>{d.zone}</td>
                      <td>{d.district}</td>
                      <td>{d.acName}</td>
                      <td>{d.vehicleNo}</td>
                      <td className="font-semibold">{d.headCount}</td>
                      <td className="font-mono text-xs">{d.lat != null ? d.lat.toFixed(6) : "—"}</td>
                      <td className="font-mono text-xs">{d.lng != null ? d.lng.toFixed(6) : "—"}</td>
                      <td>{d.etaLabel}</td>
                      <td>{d.remainingLabel}</td>
                    </tr>
                  ))}
                  {!details.length && (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-navy/50">
                        No rows
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
