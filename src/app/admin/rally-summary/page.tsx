"use client";

import { useEffect, useState } from "react";

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
  totalVehicles?: number;
  key?: string;
};

function Cards({ title, c }: { title: string; c: Counts }) {
  const items = [
    ["Users / vehicles", c.totalVehicles ?? c.users],
    ["Unique vehicles", c.uniqueVehicles],
    ["Journey started", c.started],
    ["Pending", c.pending],
    ["Reached venue", c.reached],
    ["In 30 min", c.m30],
    ["In 1 hour", c.h1],
    ["In 2 hours", c.h2],
    ["2–2.5 hours", c.h2_5],
    ["Above 2.5 hours", c.over],
  ];
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {items.map(([label, n]) => (
          <div key={label} className="admin-panel p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-navy/45">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{n}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Breakdown({ title, rows }: { title: string; rows: Counts[] }) {
  return (
    <section className="admin-panel mt-6 overflow-x-auto">
      <h2 className="px-4 pt-4 text-sm font-semibold">{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Users</th>
            <th>Unique veh</th>
            <th>Started</th>
            <th>Pending</th>
            <th>Reached</th>
            <th>30m</th>
            <th>1h</th>
            <th>2h</th>
            <th>2–2.5h</th>
            <th>&gt;2.5h</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="font-medium">{r.key}</td>
              <td>{r.users}</td>
              <td>{r.uniqueVehicles}</td>
              <td>{r.started}</td>
              <td>{r.pending}</td>
              <td>{r.reached}</td>
              <td>{r.m30}</td>
              <td>{r.h1}</td>
              <td>{r.h2}</td>
              <td>{r.h2_5}</td>
              <td>{r.over}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={11} className="py-8 text-center text-navy/50">
                No data
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
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

  async function load() {
    const res = await fetch("/api/admin/rally/summary", { cache: "no-store" });
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    setData(await res.json());
  }

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 20000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <main className="px-4 py-6">Loading…</main>;

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="admin-page-kicker">Rally</p>
      <h1 className="admin-page-title">Rally summary</h1>
      <p className="admin-page-sub">{data.rally ? data.rally.name : "No active rally"} · live refresh</p>
      <Cards title="Overall" c={data.totals} />
      <Breakdown title="Zone wise" rows={data.byZone} />
      <Breakdown title="District wise" rows={data.byDistrict} />
      <Breakdown title="AC name wise" rows={data.byAc} />
      <Breakdown title="Unique vehicle wise" rows={data.byVehicle} />
    </main>
  );
}
