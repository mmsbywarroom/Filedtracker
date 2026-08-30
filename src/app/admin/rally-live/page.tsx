"use client";

import { useEffect, useState } from "react";

type Row = {
  id: string;
  photo: string;
  headCount: number;
  etaLabel: string;
  remainingLabel: string;
  remainingSeconds: number;
  reachedAt: string | null;
  startedAt: string;
  distanceMeters: number;
  user: {
    name: string;
    phone: string;
    zone: string;
    district: string;
    acName: string;
    villageWard: string;
    vehicleNo: string;
    vehicleType: string;
    pocName: string;
    pocNumber: string;
  };
};

export default function RallyLivePage() {
  const [rally, setRally] = useState<{ name: string } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  async function load() {
    const res = await fetch("/api/admin/rally/live", { cache: "no-store" });
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const data = await res.json();
    setRally(data.rally);
    setRows(data.rows || []);
  }

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="admin-page-kicker">Rally</p>
      <h1 className="admin-page-title">Live tracking</h1>
      <p className="admin-page-sub">
        {rally ? `Active venue: ${rally.name}` : "No active rally. Create one under Rally users."} · updates every 15s
      </p>

      <section className="admin-panel mt-5 overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Photo</th>
              <th>User</th>
              <th>Heads</th>
              <th>ETA</th>
              <th>Remaining</th>
              <th>Vehicle</th>
              <th>Place</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.photo} alt="" className="h-16 w-16 rounded-lg object-cover" />
                </td>
                <td>
                  <p className="font-semibold">{r.user.name}</p>
                  <p className="text-xs text-navy/55">{r.user.phone}</p>
                  <p className="text-xs text-navy/45">POC {r.user.pocName} {r.user.pocNumber}</p>
                </td>
                <td className="font-semibold">{r.headCount}</td>
                <td>{r.etaLabel}</td>
                <td>
                  {r.reachedAt ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">Reached</span>
                  ) : (
                    <span className="font-semibold text-teal">{r.remainingLabel}</span>
                  )}
                </td>
                <td>
                  {r.user.vehicleNo}
                  <p className="text-xs text-navy/50">{r.user.vehicleType}</p>
                </td>
                <td className="text-xs">
                  {r.user.zone} · {r.user.district}
                  <p>{r.user.acName}</p>
                  <p>{r.user.villageWard}</p>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-navy/50">
                  No journey photos yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
