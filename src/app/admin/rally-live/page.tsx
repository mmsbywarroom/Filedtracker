"use client";

import { useEffect, useRef, useState } from "react";
import { countHeadsFromDataUrl, loadPersonCountModel } from "@/lib/headCount";
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
  noMove?: boolean;
  movedMeters?: number;
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
  const [counting, setCounting] = useState("");
  const rowsRef = useRef<Row[]>([]);
  const counted = useRef<Set<string>>(new Set());
  const busyCount = useRef(false);
  const recountFn = useRef<(force?: boolean) => void>(() => {});

  rowsRef.current = rows;

  async function load() {
    const res = await fetch("/api/admin/rally/live", { cache: "no-store" });
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const data = await res.json();
    setRally(data.rally);
    const incoming: Row[] = data.rows || [];
    setRows((prev) => {
      const local = new Map(prev.map((r) => [r.id, r.headCount]));
      return incoming.map((r) => ({
        ...r,
        headCount: r.headCount > 0 ? r.headCount : local.get(r.id) || 0,
      }));
    });
  }

  useEffect(() => {
    void load();
    void loadPersonCountModel().catch(() => {});
    const t = window.setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    async function countPending(force = false) {
      if (busyCount.current) return;
      busyCount.current = true;
      try {
        await loadPersonCountModel().catch(() => null);
        const list = rowsRef.current;
        for (const r of list) {
          if (!alive || !r.photo) continue;
          if (!force && (r.headCount > 0 || counted.current.has(r.id))) continue;
          setCounting(`Counting heads… ${r.user.name}`);
          try {
            const n = await countHeadsFromDataUrl(r.photo);
            if (!alive) return;
            if (n <= 0) continue;
            counted.current.add(r.id);
            setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, headCount: n } : x)));
            await fetch(`/api/admin/rally/checkins/${r.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ headCount: n }),
            });
          } catch {
            /* retry next tick */
          }
        }
      } finally {
        busyCount.current = false;
        if (alive) setCounting("");
      }
    }
    void countPending();
    recountFn.current = (force?: boolean) => {
      if (force) counted.current.clear();
      void countPending(Boolean(force));
    };
    const t = window.setInterval(() => void countPending(), 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="admin-page-kicker">Rally</p>
      <h1 className="admin-page-title">Live tracking</h1>
      <p className="admin-page-sub">
        {rally ? `Active venue: ${rally.name}` : "No active rally. Create one under Rally users."} · updates every 15s
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="admin-btn-teal-soft" onClick={() => recountFn.current(true)}>
          Recalc head count
        </button>
        {counting && <p className="text-sm text-teal">{counting}</p>}
      </div>

      <section className="admin-panel mt-5">
        <div className="overflow-x-auto">
          <table className="min-w-[1180px]">
            <thead>
              <tr>
                <th>Photo</th>
                <th>User</th>
                <th>Heads</th>
                <th>Time</th>
                <th>Capture lat</th>
                <th>Capture lng</th>
                <th>ETA</th>
                <th>Remaining</th>
                <th>Flag</th>
                <th>Vehicle</th>
                <th>Place</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.noMove ? "bg-red-50/90" : undefined}>
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
                  <td className="whitespace-nowrap text-xs text-navy/70">
                    {new Date(r.startedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </td>
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
                    {r.noMove ? (
                      <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-800">
                        No move 1h
                      </span>
                    ) : (
                      <span className="text-xs text-navy/45">{Math.round(r.movedMeters || 0)} m</span>
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
                  <td colSpan={11} className="py-10 text-center text-navy/50">
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
