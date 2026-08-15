"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import RouteMap from "@/components/RouteMapDynamic";

type Att = {
  id: string;
  punchInAt: string;
  punchOutAt: string | null;
  punchInLat: number;
  punchInLng: number;
  punchOutLat: number | null;
  punchOutLng: number | null;
  distanceMeters: number;
  points: { lat: number; lng: number; recordedAt: string }[];
};

export default function FootprintPage({ params }: { params: { id: string } }) {
  const [user, setUser] = useState<{ name: string; phone: string; sectorAllotted: string } | null>(null);
  const [rows, setRows] = useState<Att[]>([]);
  const [active, setActive] = useState<Att | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/users/${params.id}/footprint`);
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = await res.json();
      setUser(data.user);
      setRows(data.attendances || []);
      setActive(data.attendances?.[0] || null);
    })();
  }, [params.id]);

  return (
    <main className="min-h-screen bg-[#e8eef4]">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <Link href="/admin" className="text-sm text-navy/50">
          ← All users
        </Link>
        <div className="mt-3 mb-4 rounded-3xl bg-white px-4 py-3 shadow-card">
          <p className="text-xs uppercase tracking-wider text-navy/40">Travel footprint</p>
          <h1 className="text-xl font-semibold">{user?.name}</h1>
          <p className="text-sm text-navy/60">
            {user?.phone} · {user?.sectorAllotted}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <aside className="space-y-2">
            {rows.map((r) => (
              <button
                key={r.id}
                onClick={() => setActive(r)}
                className={`w-full rounded-2xl px-4 py-3 text-left shadow-card ${active?.id === r.id ? "bg-ink text-white" : "bg-white"}`}
              >
                <p className="text-sm font-medium">{new Date(r.punchInAt).toLocaleString()}</p>
                <p className={`text-xs ${active?.id === r.id ? "text-white/70" : "text-navy/50"}`}>
                  {r.punchOutAt ? "Completed" : "Live / open"} · {(r.distanceMeters / 1000).toFixed(2)} km · {r.points.length} marks
                </p>
              </button>
            ))}
            {!rows.length && <p className="text-sm text-navy/50">No punch records yet.</p>}
          </aside>
          <div className="h-[70vh] min-h-[420px] overflow-hidden rounded-[2rem] bg-white shadow-float">
            {active ? (
              <RouteMap
                points={active.points}
                punchIn={{ lat: active.punchInLat, lng: active.punchInLng }}
                punchOut={
                  active.punchOutLat != null && active.punchOutLng != null
                    ? { lat: active.punchOutLat, lng: active.punchOutLng }
                    : null
                }
                durationMs={
                  active.punchOutAt
                    ? new Date(active.punchOutAt).getTime() - new Date(active.punchInAt).getTime()
                    : Date.now() - new Date(active.punchInAt).getTime()
                }
                distanceMeters={active.distanceMeters}
              />
            ) : (
              <div className="grid h-full place-items-center text-navy/40">Select a day</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
