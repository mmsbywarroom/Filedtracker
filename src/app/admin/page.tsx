"use client";

import { useEffect, useState } from "react";
import { DESIGNATIONS } from "@/lib/hierarchy";

type Group = { name: string; users: number; active: number; live: number };

type Dash = {
  date: string;
  totalUsers: number;
  activeToday: number;
  liveNow: number;
  punches: number;
  byDesignation: Group[];
  byZone: Group[];
  byDistrict: Group[];
  byAssembly: Group[];
  byCluster: Group[];
};

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white px-5 py-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wider text-navy/45">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function GroupTable({ title, rows }: { title: string; rows: Group[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-navy/5 bg-white shadow-card">
      <div className="border-b border-navy/5 px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="max-h-[360px] overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Users</th>
              <th className="px-4 py-2">Active</th>
              <th className="px-4 py-2">Live</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-navy/5">
                <td className="px-4 py-2 font-medium">{r.name}</td>
                <td className="px-4 py-2">{r.users}</td>
                <td className="px-4 py-2">{r.active}</td>
                <td className="px-4 py-2">{r.live}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-6 text-sm text-navy/50">No data for this filter.</p>}
      </div>
    </section>
  );
}

export default function AdminDashboardPage() {
  const [date, setDate] = useState(todayIst);
  const [designation, setDesignation] = useState("");
  const [data, setData] = useState<Dash | null>(null);
  const [level, setLevel] = useState("State");

  async function load(d: string, des: string) {
    const params = new URLSearchParams({ date: d });
    if (des) params.set("designation", des);
    const res = await fetch(`/api/admin/dashboard?${params}`);
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    setData(await res.json());
    const me = await fetch("/api/admin/me").then((r) => r.json());
    if (me.admin?.accessLevel) setLevel(me.admin.accessLevel);
  }

  useEffect(() => {
    load(date, designation);
  }, [date, designation]);

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Dashboard</p>
      <h1 className="text-2xl font-semibold">Hierarchy overview</h1>
      <p className="mt-1 text-sm text-navy/55">
        Login level: <span className="font-semibold text-ink">{level}</span>
        {level === "State" ? " · full organisation" : ` · ${level} ke neeche ka data`}
      </p>

      <div className="mt-4 mb-5 flex flex-wrap gap-3">
        <label className="text-xs font-medium text-navy/55">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block rounded-xl border border-navy/10 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-navy/55">
          Designation
          <select
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            className="mt-1 block rounded-xl border border-navy/10 bg-white px-3 py-2 text-sm"
          >
            <option value="">All designations</option>
            {DESIGNATIONS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total users" value={data?.totalUsers || 0} />
        <Stat label="Active today" value={data?.activeToday || 0} />
        <Stat label="Live now" value={data?.liveNow || 0} />
        <Stat label="Punches today" value={data?.punches || 0} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <GroupTable title="Hierarchy · Designation wise" rows={data?.byDesignation || []} />
        <GroupTable title="Zone wise" rows={data?.byZone || []} />
        <GroupTable title="District wise" rows={data?.byDistrict || []} />
        <GroupTable title="Assembly wise" rows={data?.byAssembly || []} />
      </div>
    </main>
  );
}
