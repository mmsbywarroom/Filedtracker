"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FaceCapture } from "@/components/FaceCapture";
import RouteMap from "@/components/RouteMapDynamic";
import { formatDuration, formatKm } from "@/lib/utils";

type User = {
  id: string;
  name: string;
  phone: string;
  assemblyName: string;
  sectorAllotted: string;
  zone: string;
  district: string;
  faceRegisteredAt: string | null;
};

type Point = { lat: number; lng: number; recordedAt: string };
type Attendance = {
  id: string;
  punchInAt: string;
  punchOutAt: string | null;
  punchInLat: number;
  punchInLng: number;
  punchOutLat: number | null;
  punchOutLng: number | null;
  distanceMeters: number;
  points: Point[];
};

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
    });
  });
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState<Attendance | null>(null);
  const [history, setHistory] = useState<Attendance[]>([]);
  const [mode, setMode] = useState<"idle" | "register" | "in" | "out">("idle");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const buffer = useRef<Point[]>([]);

  async function refresh() {
    const me = await fetch("/api/me").then((r) => r.json());
    if (!me.user || me.user.role !== "user") {
      window.location.href = "/";
      return;
    }
    setUser(me.user);
    const att = await fetch("/api/attendance").then((r) => r.json());
    setOpen(att.open);
    setHistory(att.history || []);
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!open) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        buffer.current.push({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          recordedAt: new Date().toISOString(),
        });
        setOpen((cur) =>
          cur
            ? {
                ...cur,
                points: [
                  ...cur.points,
                  { lat: pos.coords.latitude, lng: pos.coords.longitude, recordedAt: new Date().toISOString() },
                ],
              }
            : cur
        );
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 8000 }
    );
    const t = setInterval(async () => {
      if (!buffer.current.length) return;
      const points = buffer.current.splice(0, buffer.current.length);
      await fetch("/api/attendance/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points }),
      });
    }, 20000);
    return () => {
      navigator.geolocation.clearWatch(watch);
      clearInterval(t);
    };
    // track only while this punch session is open
  }, [open?.id]);

  async function verifyFace(descriptor: number[]) {
    const res = await fetch("/api/face/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descriptor }),
    });
    const data = await res.json();
    if (!res.ok || !data.matched) throw new Error("Face did not match the registered user.");
  }

  async function onRegister(descriptor: number[]) {
    setBusy(true);
    const res = await fetch("/api/face/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descriptor }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json();
      setMsg(data.error);
      return;
    }
    setMode("idle");
    setMsg("Face registered. You can punch in now.");
    refresh();
  }

  async function punch(kind: "in" | "out", descriptor: number[]) {
    setBusy(true);
    setMsg("");
    try {
      await verifyFace(descriptor);
      const pos = await getPosition();
      const payload = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      const url = kind === "in" ? "/api/attendance" : "/api/attendance/punch-out";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMode("idle");
      setMsg(kind === "in" ? "Punched in. Route tracking started." : "Punched out. Footprint saved.");
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const live = useMemo(() => {
    if (!open) return null;
    const start = new Date(open.punchInAt).getTime();
    return {
      durationMs: Date.now() - start,
      points: open.points,
    };
  }, [open]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  if (!user) return <div className="grid min-h-screen place-items-center">Loading…</div>;

  return (
    <main className="min-h-screen bg-[#e8eef4]">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <header className="mb-4 flex items-center justify-between rounded-3xl bg-white px-4 py-3 shadow-card">
          <div>
            <p className="text-xs uppercase tracking-wider text-navy/50">Your location</p>
            <h1 className="font-semibold">{user.name}</h1>
            <p className="text-sm text-navy/60">
              {user.sectorAllotted} · {user.assemblyName}
            </p>
          </div>
          <button onClick={logout} className="text-sm text-navy/50">
            Logout
          </button>
        </header>

        {msg && <p className="mb-3 rounded-2xl bg-white px-4 py-2 text-sm text-teal">{msg}</p>}

        {mode !== "idle" && (
          <div className="mb-4 rounded-[2rem] bg-white p-6 shadow-card">
            <FaceCapture
              busy={busy}
              actionLabel={mode === "register" ? "Save my face" : mode === "in" ? "Confirm punch in" : "Confirm punch out"}
              onCapture={(d) => (mode === "register" ? onRegister(d) : punch(mode, d))}
            />
            <button className="mt-3 w-full text-sm text-navy/50" onClick={() => setMode("idle")}>
              Cancel
            </button>
          </div>
        )}

        <div className="overflow-hidden rounded-[2rem] bg-white shadow-float">
          {open ? (
            <div className="h-[52vh] min-h-[340px]">
              <RouteMap
                points={open.points}
                punchIn={{ lat: open.punchInLat, lng: open.punchInLng }}
                durationMs={live?.durationMs}
                distanceMeters={open.distanceMeters}
              />
            </div>
          ) : history[0] ? (
            <div className="h-[42vh] min-h-[280px]">
              <RouteMap
                points={history[0].points}
                punchIn={{ lat: history[0].punchInLat, lng: history[0].punchInLng }}
                punchOut={
                  history[0].punchOutLat != null && history[0].punchOutLng != null
                    ? { lat: history[0].punchOutLat, lng: history[0].punchOutLng }
                    : null
                }
                durationMs={
                  history[0].punchOutAt
                    ? new Date(history[0].punchOutAt).getTime() - new Date(history[0].punchInAt).getTime()
                    : undefined
                }
                distanceMeters={history[0].distanceMeters}
              />
            </div>
          ) : (
            <div className="grid h-64 place-items-center text-navy/50">Punch in to start your travel footprint</div>
          )}

          <div className="flex flex-wrap gap-2 p-4">
            {!user.faceRegisteredAt && (
              <button onClick={() => setMode("register")} className="rounded-full bg-navy px-5 py-3 text-white font-semibold">
                Register face
              </button>
            )}
            {user.faceRegisteredAt && !open && (
              <button onClick={() => setMode("in")} className="flex items-center gap-2 rounded-full bg-[#0f9d8e] px-6 py-3 font-semibold text-white">
                Start · Punch in
              </button>
            )}
            {open && (
              <button onClick={() => setMode("out")} className="rounded-full bg-ink px-6 py-3 font-semibold text-white">
                Punch out
              </button>
            )}
            {open && (
              <span className="self-center text-sm text-navy/60">
                Live · {formatDuration(live?.durationMs || 0)} · {formatKm(open.distanceMeters)}
              </span>
            )}
          </div>
        </div>

        <section className="mt-6">
          <h2 className="mb-3 font-semibold">Recent footprints</h2>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="rounded-2xl bg-white px-4 py-3 shadow-card">
                <p className="font-medium">{new Date(h.punchInAt).toLocaleString()}</p>
                <p className="text-sm text-navy/60">
                  {h.punchOutAt ? `Out ${new Date(h.punchOutAt).toLocaleTimeString()}` : "In progress"} · {formatKm(h.distanceMeters)}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
