"use client";

import { useEffect, useState } from "react";

type Caller = {
  name: string;
  phone: string;
  halkas: string;
  assigned: number;
  dialed: number;
  fresh: number;
  connected: number;
  complete: number;
  notConnected: number;
  redial: number;
};

type Site = Caller & {
  name: string;
  callers: number;
  users: Caller[];
};

const STATS: { key: "assigned" | "dialed" | "fresh" | "connected" | "complete" | "notConnected" | "redial"; label: string }[] = [
  { key: "assigned", label: "Assigned" },
  { key: "dialed", label: "Dialed" },
  { key: "fresh", label: "Fresh" },
  { key: "connected", label: "Connected" },
  { key: "complete", label: "Call complete" },
  { key: "notConnected", label: "Not connected" },
  { key: "redial", label: "Re-dial" },
];

export default function CallSummaryPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const total = sites.reduce(
    (sum, site) => {
      sum.callers += Number(site.callers || 0);
      for (const stat of STATS) sum[stat.key] += Number(site[stat.key] || 0);
      return sum;
    },
    { callers: 0, assigned: 0, dialed: 0, fresh: 0, connected: 0, complete: 0, notConnected: 0, redial: 0 }
  );

  useEffect(() => {
    fetch("/api/call/admin/summary").then(async (res) => {
      if (res.status === 401) {
        window.location.href = "/call/admin/login";
        return;
      }
      const data = await res.json();
      setSites(data.sites || []);
    });
  }, []);

  return (
    <main className="px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Summary</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Calling totals for each office. A member is counted with the caller they are assigned to.
          </p>
        </div>
        <a href="/api/call/admin/reports?kind=summary" className="rounded-xl bg-[#0A1628] px-3 py-2 text-sm font-semibold text-white">
          Download report
        </a>
      </div>
      {sites.length ? (
        <section className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="bg-[#0A1628] px-4 py-3 text-white">
            <h2 className="text-lg font-semibold">Total</h2>
            <p className="text-sm text-white/80">{total.callers.toLocaleString("en-IN")} callers · Yellow Stone and Unify</p>
          </div>
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 lg:grid-cols-7">
            {STATS.map((stat) => (
              <div key={stat.key} className="rounded-xl border border-slate-200 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{stat.label}</p>
                <p className="mt-1 text-xl font-semibold">{total[stat.key].toLocaleString("en-IN")}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {sites.map((site) => (
          <section key={site.name} className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className={`px-4 py-3 text-white ${site.name === "Yellow Stone" ? "bg-[#c9a227]" : "bg-teal-700"}`}>
              <h2 className="text-lg font-semibold">{site.name}</h2>
              <p className="text-sm text-white/80">{site.callers} callers</p>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
              {STATS.map((stat) => (
                <div key={stat.key} className="rounded-xl border border-slate-200 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{stat.label}</p>
                  <p className="mt-1 text-xl font-semibold">{Number(site[stat.key] || 0).toLocaleString("en-IN")}</p>
                </div>
              ))}
            </div>
            <div className="overflow-auto border-t">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    {["Caller", "Halka", "Assigned", "Dialed", "Fresh", "Connected", "Complete", "Not connected", "Re-dial"].map((h) => (
                      <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {site.users.map((user) => (
                    <tr key={user.phone} className="border-t">
                      <td className="px-3 py-2 font-medium">{user.name}</td>
                      <td className="min-w-[140px] px-3 py-2">{user.halkas || "—"}</td>
                      <td className="px-3 py-2">{user.assigned}</td>
                      <td className="px-3 py-2">{user.dialed}</td>
                      <td className="px-3 py-2">{user.fresh}</td>
                      <td className="px-3 py-2">{user.connected}</td>
                      <td className="px-3 py-2">{user.complete}</td>
                      <td className="px-3 py-2">{user.notConnected}</td>
                      <td className="px-3 py-2">{user.redial}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!site.users.length ? <p className="p-4 text-sm text-slate-500">No callers are assigned to this office yet.</p> : null}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
