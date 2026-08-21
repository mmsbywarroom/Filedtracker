"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { DESIGNATIONS, cleanScope } from "@/lib/hierarchy";
import { formatKm } from "@/lib/utils";

type Group = {
  name: string;
  users: number;
  active: number;
  inactive: number;
  punched: number;
  live: number;
  distance: number;
};

type Dash = {
  date: string;
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  activeToday: number;
  liveNow: number;
  punches: number;
  totalDistance: number;
  byDesignation: Group[];
  byZone: Group[];
  byDistrict: Group[];
  byAssembly: Group[];
  byCluster: Group[];
};

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string | number;
  hint: string;
  className: string;
}) {
  return (
    <div className={`rounded-2xl px-5 py-4 text-white shadow-card ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-white/75">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-white/70">{hint}</p>
    </div>
  );
}

function GroupTable({ title, accent, rows }: { title: string; accent: string; rows: Group[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-navy/5 bg-white shadow-card">
      <div className={`border-b border-navy/5 px-4 py-3 ${accent}`}>
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="max-h-[360px] overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Users</th>
              <th className="px-4 py-2">Active</th>
              <th className="px-4 py-2">Inactive</th>
              <th className="px-4 py-2">Punched</th>
              <th className="px-4 py-2">Live</th>
              <th className="px-4 py-2">Distance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} className={`border-t border-navy/5 ${i % 2 ? "bg-sand/40" : "bg-white"}`}>
                <td className="px-4 py-2 font-medium">{r.name}</td>
                <td className="px-4 py-2">{r.users}</td>
                <td className="px-4 py-2 text-teal">{r.active}</td>
                <td className="px-4 py-2 text-navy/50">{r.inactive}</td>
                <td className="px-4 py-2 text-[#c45c12]">{r.punched}</td>
                <td className="px-4 py-2 text-emerald-600">{r.live}</td>
                <td className="px-4 py-2 font-semibold text-ink">{formatKm(r.distance || 0)}</td>
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
  const [isSuper, setIsSuper] = useState(false);
  const [scope, setScope] = useState({
    zone: "",
    district: "",
    assemblyName: "",
    assemblies: [] as string[],
    cluster: "",
  });

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
    setIsSuper(Boolean(me.admin?.isSuper));
    const assemblies = Array.isArray(me.admin?.assemblies) ? me.admin.assemblies : [];
    setScope({
      zone: me.admin?.zone || "",
      district: me.admin?.district || "",
      assemblyName: me.admin?.assemblyName || "",
      assemblies,
      cluster: me.admin?.cluster || "",
    });
  }

  useEffect(() => {
    load(date, designation);
  }, [date, designation]);

  const mappedAssemblies =
    scope.assemblies.length > 0
      ? scope.assemblies.map(cleanScope).filter(Boolean)
      : cleanScope(scope.assemblyName)
        ? cleanScope(scope.assemblyName).split(/[|;,]/).map((a) => cleanScope(a)).filter(Boolean)
        : [];

  const scopeText = isSuper
    ? "Full organisation"
    : level === "ALC" && !cleanScope(scope.assemblyName)
      ? "No assembly assigned — no users visible"
      : (level === "ZLC" || level === "Zone Coordinator") && !cleanScope(scope.zone)
        ? "No zone assigned — no users visible"
        : level === "DLC" && !cleanScope(scope.district) && !mappedAssemblies.length
          ? "No district assigned — no users visible"
          : level === "Cluster" && !mappedAssemblies.length && !cleanScope(scope.cluster)
            ? "No cluster / assemblies assigned — no users visible"
            : [
                "Users in scope",
                cleanScope(scope.zone),
                cleanScope(scope.district),
                cleanScope(scope.cluster),
                mappedAssemblies.length ? `${mappedAssemblies.length} assemblies` : cleanScope(scope.assemblyName),
              ]
                .filter(Boolean)
                .join(" · ");

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#fff6d4] via-[#f3f6fb] to-[#e8eef8] px-4 py-6 md:px-8">
      <div className="mb-2 flex items-center gap-3">
        <BrandMark size={64} />
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-teal">Dashboard</p>
          <h1 className="text-2xl font-semibold">Hierarchy overview</h1>
        </div>
      </div>
      <p className="mt-1 text-sm text-navy/55">
        Login: <span className="rounded-full bg-teal px-2 py-0.5 text-xs font-semibold text-white">{level}</span>
        {" · "}
        {scopeText}
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat className="bg-ink" label="Total users" value={data?.totalUsers || 0} hint="Users in your assigned area" />
        <Stat className="bg-teal" label="Active" value={data?.activeUsers || 0} hint="Account enabled" />
        <Stat className="bg-navy/70" label="Inactive" value={data?.inactiveUsers || 0} hint="Account disabled" />
        <Stat className="bg-emerald-600" label="Live now" value={data?.liveNow || 0} hint="Currently in the field" />
        <Stat className="bg-[#c45c12]" label="Punched today" value={data?.activeToday || 0} hint="Punched in today" />
        <Stat className="bg-[#0f766e]" label="Distance" value={formatKm(data?.totalDistance || 0)} hint="Total travel today" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <GroupTable title="Hierarchy · Designation wise" accent="bg-[#12305A] text-white" rows={data?.byDesignation || []} />
        <GroupTable title="Zone wise" accent="bg-teal text-white" rows={data?.byZone || []} />
        <GroupTable title="District wise" accent="bg-emerald-700 text-white" rows={data?.byDistrict || []} />
        <GroupTable title="Assembly wise" accent="bg-[#1A56C4] text-white" rows={data?.byAssembly || []} />
      </div>
    </main>
  );
}
