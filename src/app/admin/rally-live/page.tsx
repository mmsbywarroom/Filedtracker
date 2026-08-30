"use client";

import { useEffect, useRef, useState } from "react";
import { countHeadsFromDataUrl, loadHeadCountModels } from "@/lib/face";
import { PhotoViewer } from "@/components/PhotoViewer";

type Row = {
  id: string;
  photo: string;
  headCount: number;
  lat: number;
  lng: number;
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
  const [view, setView] = useState<Row | null>(null);
  const counted = useRef<Set<string>>(new Set());

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
    void loadHeadCountModels().catch(() => {});
    const t = window.setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const r of rows) {
        if (cancelled || r.headCount > 0 || counted.current.has(r.id) || !r.photo) continue;
        counted.current.add(r.id);
        try {
          const n = await countHeadsFromDataUrl(r.photo);
          if (cancelled || n <= 0) continue;
          setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, headCount: n } : x)));
          await fetch(`/api/admin/rally/checkins/${r.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ headCount: n }),
          });
        } catch {
          /* keep 0 */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rows]);

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="admin-page-kicker">Rally</p>
      <h1 className="admin-page-title">Live tracking</h1>
      <p className="admin-page-sub">
        {rally ? `Active venue: ${rally.name}` : "No active rally. Create one under Rally users."} · updates every 15s
      </p>

      <section className="admin-panel mt-5">
        <div className="overflow-x-auto">
          <table className="min-w-[1080px]">
            <thead>
              <tr>
                <th>Photo</th>
                <th>User</th>
                <th>Heads</th>
                <th>Capture lat</th>
                <th>Capture lng</th>
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
                    <button type="button" onClick={() => setView(r)} className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.photo} alt="" className="h-20 w-20 rounded-lg object-cover ring-1 ring-navy/10 hover:ring-2 hover:ring-teal" />
                    </button>
                  </td>
                  <td>
                    <p className="font-semibold">{r.user.name}</p>
                    <p className="text-xs text-navy/55">{r.user.phone}</p>
                    <p className="text-xs text-navy/45">
                      POC {r.user.pocName} {r.user.pocNumber}
                    </p>
                  </td>
                  <td className="text-lg font-semibold">{r.headCount}</td>
                  <td className="font-mono text-xs">{Number(r.lat).toFixed(6)}</td>
                  <td className="font-mono text-xs">
                    {Number(r.lng).toFixed(6)}
                    <a
                      href={`https://maps.google.com/?q=${r.lat},${r.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block text-[11px] font-semibold text-teal"
                    >
                      Map
                    </a>
                  </td>
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
                  <td colSpan={9} className="py-10 text-center text-navy/50">
                    No journey photos yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {view && (
        <PhotoViewer
          src={view.photo}
          title={`${view.user.name} · ${view.user.phone} · ${view.headCount} heads`}
          onClose={() => setView(null)}
        />
      )}
    </main>
  );
}
