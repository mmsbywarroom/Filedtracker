"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FaceCapture } from "@/components/FaceCapture";
import { BrandMark } from "@/components/BrandMark";
import RouteMap from "@/components/RouteMapDynamic";
import { formatDuration, formatKm, isPlausibleStep, pathDistance } from "@/lib/utils";
import { loadFaceModels } from "@/lib/face";
import { LangToggle, useLang } from "@/lib/i18n";

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

type Point = { lat: number; lng: number; recordedAt: string; accuracy?: number };
type Attendance = {
  id: string;
  punchInAt: string;
  punchOutAt: string | null;
  punchInLat: number;
  punchInLng: number;
  punchOutLat: number | null;
  punchOutLng: number | null;
  punchOutReason?: string | null;
  distanceMeters: number;
  points: Point[];
};

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is off. Turn on Location in phone settings."));
      return;
    }
    const fail = (err: GeolocationPositionError | Error) => {
      const code = "code" in err ? err.code : 0;
      if (code === 1) reject(new Error("Location permission is blocked. Allow it in Chrome site settings."));
      else if (code === 3) reject(new Error("GPS timed out. Try outdoors, then tap Confirm."));
      else reject(new Error("Location not found. Turn on GPS and tap Confirm again."));
    };
    // Prefer a quick cached/network fix first; fall back to high-accuracy GPS.
    navigator.geolocation.getCurrentPosition(resolve, () => {
      navigator.geolocation.getCurrentPosition(resolve, fail, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      });
    }, {
      enableHighAccuracy: false,
      timeout: 4000,
      maximumAge: 120000,
    });
  });
}

export default function DashboardPage() {
  const { t } = useLang();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState<Attendance | null>(null);
  const [mode, setMode] = useState<"idle" | "register" | "in" | "out">("idle");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [okMsg, setOkMsg] = useState(false);
  const buffer = useRef<Point[]>([]);
  const lastFix = useRef<{ lat: number; lng: number } | null>(null);
  const liveAcc = useRef<number>(Infinity);
  const pendingGps = useRef<Promise<GeolocationPosition | null> | null>(null);
  const gpsOffLock = useRef(false);
  const [gpsOffFlag, setGpsOffFlag] = useState(false);
  const [livePos, setLivePos] = useState<{ lat: number; lng: number } | null>(null);

  async function refresh() {
    const me = await fetch("/api/me").then((r) => r.json());
    if (!me.user || me.user.role !== "user") {
      window.location.href = "/";
      return;
    }
    setUser(me.user);
    const att = await fetch("/api/attendance").then((r) => r.json());
    setOpen(att.open);
    const last = att.history?.[0];
    if (!att.open && last?.punchOutReason === "gps_off") setGpsOffFlag(true);
  }

  useEffect(() => {
    refresh();
    loadFaceModels().catch(() => {});
  }, []);

  // Fast map pin: accept cached/network location first, then refine with GPS
  useEffect(() => {
    if (!navigator.geolocation) return;
    const apply = (pos: GeolocationPosition, force = false) => {
      const acc = pos.coords.accuracy || 9999;
      // Map can show a coarse fix; skip only absurd readings
      if (!force && acc > 2000) return;
      // Prefer better accuracy; allow small worsen so the pin still moves with you
      if (!force && acc > liveAcc.current * 1.8 && liveAcc.current < 80) return;
      liveAcc.current = acc;
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLivePos(next);
      lastFix.current = next;
    };

    // 1) Instant-ish: last known / network location
    navigator.geolocation.getCurrentPosition((p) => apply(p, true), () => {}, {
      enableHighAccuracy: false,
      timeout: 3500,
      maximumAge: 180000,
    });
    // 2) Better GPS shortly after
    navigator.geolocation.getCurrentPosition((p) => apply(p, true), () => {}, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 5000,
    });
    // 3) Keep updating
    const watch = navigator.geolocation.watchPosition((p) => apply(p), () => {}, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
    });
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  useEffect(() => {
    if (mode === "in") {
      pendingGps.current = getPosition().catch(() => null);
    }
  }, [mode]);

  async function autoPunchOutForGpsOff() {
    if (gpsOffLock.current) return;
    gpsOffLock.current = true;
    const last =
      lastFix.current ||
      (open ? { lat: open.punchInLat, lng: open.punchInLng } : null);
    if (buffer.current.length) {
      const batch = buffer.current.splice(0, buffer.current.length);
      fetch("/api/attendance/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ points: batch }),
      }).catch(() => {});
    }
    try {
      await fetch("/api/attendance/gps-off", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          lat: last?.lat,
          lng: last?.lng,
          address: "GPS turned off",
        }),
      });
    } catch {
      /* still show flag */
    }
    setOpen(null);
    setMode("idle");
    setOkMsg(false);
    setGpsOffFlag(true);
    setMsg(t("gpsOffFlag"));
    refresh();
  }

  useEffect(() => {
    if (!open) return;
    lastFix.current = open.points[open.points.length - 1] || { lat: open.punchInLat, lng: open.punchInLng };
    gpsOffLock.current = false;
    let wake: { release: () => Promise<void> } | null = null;
    navigator.wakeLock?.request("screen").then((lock) => {
      wake = lock;
    }).catch(() => {});

    const flush = async () => {
      if (!buffer.current.length) return;
      const batch = buffer.current.splice(0, buffer.current.length);
      await fetch("/api/attendance/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          points: batch,
        }),
      });
    };

    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        if (pos.coords.accuracy > 200) return;
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLivePos(next);
        if (lastFix.current && !isPlausibleStep(lastFix.current, next, pos.coords.accuracy)) return;
        lastFix.current = next;
        const point = { ...next, recordedAt: new Date().toISOString(), accuracy: pos.coords.accuracy };
        buffer.current.push(point);
        setOpen((cur) => (cur ? { ...cur, points: [...cur.points, point] } : cur));
      },
      (err) => {
        if (err.code === 1 || err.code === 2) autoPunchOutForGpsOff();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
    const t = setInterval(flush, 8000);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);

    let perm: PermissionStatus | null = null;
    const onPerm = () => {
      if (perm && perm.state !== "granted") autoPunchOutForGpsOff();
    };
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((status) => {
        perm = status;
        status.addEventListener("change", onPerm);
      })
      .catch(() => {});

    return () => {
      navigator.geolocation.clearWatch(watch);
      clearInterval(t);
      document.removeEventListener("visibilitychange", onHide);
      perm?.removeEventListener("change", onPerm);
      flush();
      wake?.release().catch(() => {});
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
    if (!res.ok) throw new Error(data.error || "Face check failed.");
    if (!data.matched) {
      throw new Error("Face did not match. Look straight at the camera.");
    }
  }

  async function onRegister(descriptor: number[], image: string) {
    setBusy(true);
    const res = await fetch("/api/face/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descriptor, image }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json();
      setMsg(data.error);
      return;
    }
    setMode("idle");
    setOkMsg(true);
    setMsg(t("faceSaved"));
    refresh();
  }

  async function punch(kind: "in" | "out", descriptor: number[], image: string) {
    setBusy(true);
    setMsg("");
    setOkMsg(false);
    try {
      await verifyFace(descriptor);
      let lat: number;
      let lng: number;
      let accuracy: number | null = null;
      if (kind === "out") {
        if (buffer.current.length) {
          const batch = buffer.current.splice(0, buffer.current.length);
          fetch("/api/attendance/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            keepalive: true,
            body: JSON.stringify({ points: batch }),
          }).catch(() => {});
        }
        const last =
          lastFix.current ||
          open?.points?.[open.points.length - 1] ||
          (open ? { lat: open.punchInLat, lng: open.punchInLng } : null);
        if (!last) throw new Error("Location not found. Turn on GPS and tap Confirm again.");
        lat = last.lat;
        lng = last.lng;
      } else {
        try {
          const cached = pendingGps.current ? await pendingGps.current : null;
          const pos = cached || (await getPosition());
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          accuracy = pos.coords.accuracy;
        } catch (locErr) {
          throw locErr;
        }
      }
      const payload = { lat, lng, accuracy, image };
      const url = kind === "in" ? "/api/attendance" : "/api/attendance/punch-out";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save punch.");
      setMode("idle");
      setOkMsg(true);
      setGpsOffFlag(false);
      setMsg(kind === "in" ? t("punchedIn") : t("punchedOut"));
      setBusy(false);
      refresh();
      return;
    } catch (e) {
      const text =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String((e as { message: string }).message)
            : "Punch failed. Try face and location again, then tap Confirm.";
      setMsg(text);
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

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <BrandMark size={80} />
        <p>{t("loading")}</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-sand">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <header className="mb-4 flex items-center justify-between gap-3 rounded-3xl bg-white px-4 py-3 shadow-card">
          <div className="flex items-center gap-3">
            <BrandMark size={56} />
            <div>
              <p className="text-xs uppercase tracking-wider text-navy/50">{t("aap")}</p>
              <h1 className="font-semibold">{user.name}</h1>
              <p className="text-sm text-navy/60">
                {user.sectorAllotted} · {user.assemblyName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LangToggle tone="light" />
            <button onClick={logout} className="text-sm text-navy/50">
              {t("logout")}
            </button>
          </div>
        </header>

        {gpsOffFlag && (
          <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-semibold">Punched out because GPS was turned off</p>
            <p className="mt-1">{t("gpsOffFlag")}</p>
          </div>
        )}
        {msg && (
          <p
            className={`mb-3 rounded-2xl px-4 py-2 text-sm ${
              okMsg ? "bg-white text-teal" : "bg-red-50 text-red-700"
            }`}
          >
            {msg}
          </p>
        )}

        {mode !== "idle" && (
          <div className="mb-4 rounded-[2rem] bg-white p-6 shadow-card">
            <FaceCapture
              busy={busy}
              actionLabel={mode === "register" ? t("saveFace") : mode === "in" ? t("confirmIn") : t("confirmOut")}
              onCapture={(d, image) => (mode === "register" ? onRegister(d, image) : punch(mode, d, image))}
            />
            <button className="mt-3 w-full text-sm text-navy/50" onClick={() => setMode("idle")}>
              {t("cancel")}
            </button>
          </div>
        )}

        {/* Punch actions ABOVE the map so they never get covered on any phone */}
        {mode === "idle" && (
          <div className="mb-3 rounded-[1.75rem] bg-white p-4 shadow-card">
            {!user.faceRegisteredAt ? (
              <button
                type="button"
                onClick={() => setMode("register")}
                className="w-full rounded-2xl bg-navy px-5 py-4 text-base font-semibold text-white"
              >
                {t("registerFace")}
              </button>
            ) : open ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setMode("out")}
                  className="w-full rounded-2xl bg-ink px-5 py-4 text-base font-semibold text-white sm:w-auto sm:min-w-[200px]"
                >
                  {t("punchOut")}
                </button>
                <span className="text-sm text-navy/60">
                  {t("live")} · {formatDuration(live?.durationMs || 0)} ·{" "}
                  {formatKm(
                    Math.max(
                      open.distanceMeters,
                      pathDistance([{ lat: open.punchInLat, lng: open.punchInLng }, ...open.points])
                    )
                  )}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setMode("in")}
                  className="w-full rounded-2xl bg-teal px-5 py-4 text-base font-semibold text-white"
                >
                  {t("punchIn")}
                </button>
                <p className="text-center text-xs text-navy/45 sm:text-left">{t("punchStart")}</p>
              </div>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-[2rem] bg-white shadow-float">
          {open ? (
            <div className="h-[min(48vh,400px)] min-h-[240px] overflow-hidden">
              <RouteMap
                points={open.points}
                punchIn={{ lat: open.punchInLat, lng: open.punchInLng }}
                liveLocation={livePos}
                durationMs={live?.durationMs}
                distanceMeters={open.distanceMeters}
              />
            </div>
          ) : (
            <div className="h-[min(40vh,360px)] min-h-[220px] overflow-hidden">
              <RouteMap points={[]} liveLocation={livePos} />
            </div>
          )}
        </div>

        <Link
          href="/dashboard/leave"
          className="mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-card"
        >
          <div>
            <p className="font-semibold">{t("leaveRequest")}</p>
            <p className="text-sm text-navy/55">{t("leaveHint")}</p>
          </div>
          <span className="text-navy/40">→</span>
        </Link>
        <Link
          href="/dashboard/footprints"
          className="mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-card"
        >
          <div>
            <p className="font-semibold">{t("recent")}</p>
            <p className="text-sm text-navy/55">{t("viewAll")}</p>
          </div>
          <span className="text-navy/40">→</span>
        </Link>
      </div>
    </main>
  );
}
