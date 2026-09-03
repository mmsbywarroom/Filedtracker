"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { FaceCapture } from "@/components/FaceCapture";
import { BrandMark } from "@/components/BrandMark";
import RouteMap from "@/components/RouteMapDynamic";
import { formatDuration, formatKm, mapGpsSpreadFromFixes, shouldCreditTrackStep, sessionTravelMeters } from "@/lib/utils";
import { isSlotDueNow, MAX_INTERVAL_SLOTS } from "@/lib/attendanceIntervalFlag";
import { isNativeApp, syncNativeBackgroundTracking } from "@/lib/nativeBackgroundLocation";
import { logoutUser } from "@/lib/nativeApp";
import { NativeLocationBanner } from "@/components/NativeLocationBanner";
import {
  captureGpsFix,
  getFreshPosition,
  isIosBrowser,
  locateDevice,
  withTimeout,
  type GpsFix,
} from "@/lib/deviceGeo";
import { LATEST_NATIVE_APK } from "@/lib/apkDownload";
import { useClientNativeApp } from "@/hooks/useClientNativeApp";
import { apiFetch } from "@/lib/clientHeaders";
import { assertNativeSecureForPunch, isPureNativeApp, saveNativeSession } from "@/lib/pureNativeApp";
import { LangToggle, useLang } from "@/lib/i18n";

const AUTO_12H_MS = 12 * 60 * 60 * 1000;

async function readApiJson<T extends Record<string, unknown>>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(
      res.ok
        ? "Server returned empty response. Try again."
        : `Server error (${res.status}). Wait a minute and try again.`
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Server error (${res.status}). Try again in a minute.`);
  }
}

type User = {
  id: string;
  name: string;
  phone: string;
  assemblyName: string;
  sectorAllotted: string;
  zone: string;
  district: string;
  faceRegisteredAt: string | null;
  usesTurban?: boolean;
};

type Point = { lat: number; lng: number; recordedAt: string; accuracy?: number };
type PunchGps = GpsFix;
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
  intervalSnapshotsDone?: number[];
};

export default function DashboardPage() {
  const { t } = useLang();
  const inNativeApp = useClientNativeApp();
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState<Attendance | null>(null);
  const [mode, setMode] = useState<"idle" | "register" | "in" | "out">("idle");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [okMsg, setOkMsg] = useState(false);
  const buffer = useRef<Point[]>([]);
  const mapProbeFixes = useRef<{ lat: number; lng: number; accuracy: number; at: number }[]>([]);
  const mapProbeBatch = useRef<{ lat: number; lng: number; accuracy: number; at: number }[]>([]);
  const intervalSnapshotTimers = useRef<number[]>([]);
  const intervalSnapshotsSent = useRef<Set<number>>(new Set());
  const intervalSnapshotBusy = useRef(false);
  const intervalVisibilityHandler = useRef<(() => void) | null>(null);
  const lastFix = useRef<{ lat: number; lng: number } | null>(null);
  const lastRecorded = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const liveAcc = useRef<number>(Infinity);
  const punchGpsRef = useRef<PunchGps | null>(null);
  const [registerTurban, setRegisterTurban] = useState(false);
  const geoWatchId = useRef<number | null>(null);
  const geoStarted = useRef(false);
  const trackFixRef = useRef<((pos: GeolocationPosition) => void) | null>(null);
  const gpsOffLock = useRef(false);
  const gpsDenyStreak = useRef(0);
  const gpsDenyResetTimer = useRef<number | null>(null);
  const [gpsOffFlag, setGpsOffFlag] = useState(false);
  const [livePos, setLivePos] = useState<{ lat: number; lng: number } | null>(null);
  const [todayDistanceMeters, setTodayDistanceMeters] = useState(0);
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [bootError, setBootError] = useState("");
  const [booting, setBooting] = useState(true);
  const [punchInAllowed, setPunchInAllowed] = useState(true);
  const [punchInHint, setPunchInHint] = useState("");
  const [todayPriorClosedMs, setTodayPriorClosedMs] = useState(0);

  const applyPosition = useCallback((pos: GeolocationPosition, force = false) => {
    const acc = pos.coords.accuracy || 9999;
    const isFirst = !lastFix.current;
    if (!force && !isFirst && acc > 4000) return;
    if (!force && !isFirst && acc > liveAcc.current * 1.8 && liveAcc.current < 80) return;
    liveAcc.current = acc;
    const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    setLivePos(next);
    lastFix.current = next;
    setGpsError("");
  }, []);

  const startGeoTracking = useCallback(() => {
    if (geoStarted.current || !navigator.geolocation) return;
    geoStarted.current = true;
    locateDevice()
      .then((p) => applyPosition(p, true))
      .catch(() => {});
    geoWatchId.current = navigator.geolocation.watchPosition(
      (p) => applyPosition(p, true),
      () => {},
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: isIosBrowser() ? 30000 : 20000,
      }
    );
  }, [applyPosition]);

  const stopGeoTracking = useCallback(() => {
    if (geoWatchId.current != null) {
      navigator.geolocation.clearWatch(geoWatchId.current);
      geoWatchId.current = null;
    }
    geoStarted.current = false;
  }, []);

  async function refresh() {
    setBootError("");
    try {
      const meRes = await withTimeout(
        fetch("/api/me", { cache: "no-store" }),
        12000,
        "Server slow to respond. Check network and try again."
      );
      const me = await meRes.json().catch(() => ({} as { user?: null; error?: string }));

      // Server/DB down — do NOT redirect (that caused infinite refresh loop with middleware)
      if (!meRes.ok) {
        setBooting(false);
        setBootError(
          me.error ||
            `Server error (${meRes.status}). Disk may be full or app is restarting — wait 1 min and try again.`
        );
        return;
      }

      if (me.user?.kind === "rally") {
        window.location.replace("/rally");
        return;
      }

      if (!me.user || me.user.role !== "user") {
        // Clear cookie first so middleware does not bounce / → /dashboard forever
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        window.location.replace("/?relogin=1");
        return;
      }

      setUser(me.user);
      setBooting(false);

      const attRes = await withTimeout(
        fetch("/api/attendance", { cache: "no-store" }),
        15000,
        "Attendance load timed out."
      );
      const att = await attRes.json().catch(() => ({}));
      if (attRes.ok) {
        setOpen(att.open ?? null);
        setTodayDistanceMeters(Number(att.todayDistanceMeters) || 0);
        setPunchInAllowed(att.punchInAllowed !== false);
        setTodayPriorClosedMs(Number(att.todayPriorClosedMs) || 0);
        setPunchInHint(
          att.punchInAllowed && att.punchInAllowedReason === "reentry"
            ? String(att.punchInWindowMessage || "")
            : ""
        );
        const last = att.history?.[0];
        if (!att.open && last?.punchOutReason === "gps_off" && last.punchOutAt) {
          const age = Date.now() - new Date(last.punchOutAt).getTime();
          if (age >= 0 && age < 10 * 60 * 1000) setGpsOffFlag(true);
        }
        if (!att.open && last?.punchOutReason === "auto_12h" && last.punchOutAt) {
          const age = Date.now() - new Date(last.punchOutAt).getTime();
          if (age >= 0 && age < 10 * 60 * 1000) {
            setOkMsg(true);
            setMsg("Auto punched out after 12 hours (no punch-out).");
          }
        }
        if (!att.open && last?.punchOutReason === "auto_geofence" && last.punchOutAt) {
          const age = Date.now() - new Date(last.punchOutAt).getTime();
          if (age >= 0 && age < 10 * 60 * 1000) {
            setOkMsg(true);
            setMsg("Auto punched out: you left the 1000 m office boundary.");
          }
        }
        if (!att.open && last?.punchOutReason === "gps_spoof" && last.punchOutAt) {
          const age = Date.now() - new Date(last.punchOutAt).getTime();
          if (age >= 0 && age < 10 * 60 * 1000) {
            setMsg(t("gpsSpoofAutoOut"));
          }
        }
      }
    } catch (e) {
      setBooting(false);
      setBootError(e instanceof Error ? e.message : "Could not load dashboard.");
    }
  }

  useEffect(() => {
    void refresh();
    // Load face models in the background — never block dashboard open
    void import("@/lib/face")
      .then((m) => m.loadFaceModels())
      .catch(() => {});
  }, []);

  /** While punched in: re-check server often so 12h auto punch-out applies even if GPS stops. */
  useEffect(() => {
    void syncNativeBackgroundTracking(open?.punchInAt ?? null);
  }, [open?.id, open?.punchInAt]);

  useEffect(() => {
    if (!open) return;
    const poll = window.setInterval(() => {
      refresh();
    }, 60_000);
    const overdue = window.setInterval(() => {
      const start = new Date(open.punchInAt).getTime();
      if (Date.now() - start >= AUTO_12H_MS) refresh();
    }, 15_000);
    return () => {
      clearInterval(poll);
      clearInterval(overdue);
    };
  }, [open?.id, open?.punchInAt]);

  useEffect(() => {
    const onGesture = () => startGeoTracking();
    window.addEventListener("touchstart", onGesture, { once: true, passive: true });
    window.addEventListener("click", onGesture, { once: true });
    return () => {
      window.removeEventListener("touchstart", onGesture);
      window.removeEventListener("click", onGesture);
      stopGeoTracking();
    };
  }, [startGeoTracking, stopGeoTracking]);

  /** Idle map watch conflicts with session watch — use only one GPS pipeline. */
  useEffect(() => {
    if (open) stopGeoTracking();
  }, [open?.id, stopGeoTracking]);

  async function autoPunchOutForGpsOff() {
    if (gpsOffLock.current || document.visibilityState !== "visible") return;
    try {
      const perm = await navigator.permissions?.query({ name: "geolocation" });
      if (perm && perm.state !== "denied") return;
    } catch {
      if (gpsDenyStreak.current < 2) return;
    }
    gpsOffLock.current = true;
    const last =
      lastFix.current ||
      (open ? { lat: open.punchInLat, lng: open.punchInLng } : null);
    if (buffer.current.length) {
      const batch = buffer.current.splice(0, buffer.current.length);
      apiFetch("/api/attendance/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ points: batch }),
      }).catch(() => {});
    }
    try {
      await apiFetch("/api/attendance/gps-off", {
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

  async function sendIntervalSnapshot(slot: number) {
    if (intervalSnapshotsSent.current.has(slot) || intervalSnapshotBusy.current) return;
    intervalSnapshotBusy.current = true;
    try {
      const pos = await locateDevice();
      const res = await apiFetch("/api/attendance/interval-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      });
      if (res.ok) {
        intervalSnapshotsSent.current.add(slot);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data?.code === "SLOT_MISSED" || data?.code === "SLOT_TOO_EARLY" || data?.alreadyRecorded) {
        intervalSnapshotsSent.current.add(slot);
      }
    } catch {
      /* next 60s poll retries while still in due window */
    } finally {
      intervalSnapshotBusy.current = false;
    }
  }

  async function pollDueIntervalSnapshot(punchInAt: string) {
    if (intervalSnapshotBusy.current) return;
    const punchIn = new Date(punchInAt);
    for (let slot = 1; slot <= MAX_INTERVAL_SLOTS; slot++) {
      if (intervalSnapshotsSent.current.has(slot)) continue;
      if (!isSlotDueNow(punchIn, slot)) continue;
      await sendIntervalSnapshot(slot);
      return;
    }
  }

  function clearIntervalSnapshotTimers() {
    for (const id of intervalSnapshotTimers.current) window.clearTimeout(id);
    intervalSnapshotTimers.current = [];
  }

  function startIntervalSnapshotPoller(session: Attendance) {
    clearIntervalSnapshotTimers();
    intervalSnapshotsSent.current = new Set(session.intervalSnapshotsDone || []);
    const punchInAt = session.punchInAt;
    void pollDueIntervalSnapshot(punchInAt);
    const pollId = window.setInterval(() => {
      void pollDueIntervalSnapshot(punchInAt);
    }, 60_000);
    intervalSnapshotTimers.current.push(pollId);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pollDueIntervalSnapshot(punchInAt);
    };
    document.addEventListener("visibilitychange", onVisible);
    intervalVisibilityHandler.current = onVisible;
  }

  useEffect(() => {
    if (!open) {
      mapProbeFixes.current = [];
      clearIntervalSnapshotTimers();
      if (intervalVisibilityHandler.current) {
        document.removeEventListener("visibilitychange", intervalVisibilityHandler.current);
        intervalVisibilityHandler.current = null;
      }
      intervalSnapshotsSent.current.clear();
      return;
    }
    // 30-min interval snapshots (attendance FLAG) only for native / iOS punch-in sessions.
    // FieldLocationService also records them in background; this poller is a backup while the UI is open.
    if (isPureNativeApp()) {
      startIntervalSnapshotPoller(open);
    }
    const seed = open.points[open.points.length - 1] || { lat: open.punchInLat, lng: open.punchInLng };
    lastFix.current = seed;
    setLivePos(seed);
    const lastPt = open.points[open.points.length - 1];
    lastRecorded.current = lastPt
      ? { lat: lastPt.lat, lng: lastPt.lng, at: new Date(lastPt.recordedAt).getTime() || Date.now() }
      : { lat: open.punchInLat, lng: open.punchInLng, at: new Date(open.punchInAt).getTime() };
    gpsOffLock.current = false;
    let wake: { release: () => Promise<void> } | null = null;
    navigator.wakeLock?.request("screen").then((lock) => {
      wake = lock;
    }).catch(() => {});

    const flush = async () => {
      const batch = buffer.current.splice(0, buffer.current.length);
      const mapBatch = mapProbeBatch.current.splice(0, mapProbeBatch.current.length);
      const mapGpsSpreadM = mapGpsSpreadFromFixes(mapProbeFixes.current);
      const heartbeat = lastFix.current ? { lat: lastFix.current.lat, lng: lastFix.current.lng } : null;
      try {
        const res = await fetch("/api/attendance/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({ points: batch, mapGpsSpreadM, mapProbes: mapBatch, heartbeat }),
        });
        if (res.status === 409) {
          const data = await res.json().catch(() => ({}));
          if (data?.code === "AUTO_12H") {
            setOpen(null);
            setMode("idle");
            setOkMsg(true);
            setMsg("Auto punched out after 12 hours (no punch-out).");
            refresh();
          } else if (data?.code === "AUTO_GEOFENCE") {
            setOpen(null);
            setMode("idle");
            setOkMsg(true);
            setMsg(data?.error || "Auto punched out: you left the 1000 m office boundary.");
            refresh();
          }
        } else if (res.status === 400 && batch.length === 0 && mapBatch.length === 0) {
          // Session may already have been closed by server cron
          refresh();
        }
      } catch {
        /* ignore network blips */
      }
    };

    const recordFix = (pos: GeolocationPosition) => {
      gpsDenyStreak.current = 0;
      const acc = pos.coords.accuracy || 9999;
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLivePos(next);
      lastFix.current = next;
      if (acc <= 65) {
        const probe = { lat: next.lat, lng: next.lng, accuracy: acc, at: Date.now() };
        mapProbeFixes.current.push(probe);
        mapProbeBatch.current.push(probe);
        if (mapProbeFixes.current.length > 48) {
          mapProbeFixes.current = mapProbeFixes.current.slice(-48);
        }
      }
      if (acc > 65) return;
      const from = lastRecorded.current;
      const dt = from ? Date.now() - from.at : Date.now() - new Date(open.punchInAt).getTime();
      if (from && !shouldCreditTrackStep(from, next, acc, dt)) return;
      lastRecorded.current = { ...next, at: Date.now() };
      const point = { ...next, recordedAt: new Date().toISOString(), accuracy: acc };
      buffer.current.push(point);
      setOpen((cur) => (cur ? { ...cur, points: [...cur.points, point] } : cur));
    };
    trackFixRef.current = recordFix;

    const trackOpts: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: isIosBrowser() ? 30000 : 25000,
    };

    getFreshPosition()
      .then(recordFix)
      .catch(() => {});

    const watch = navigator.geolocation.watchPosition(recordFix, (err) => {
        if (err.code !== 1 || document.visibilityState !== "visible") return;
        gpsDenyStreak.current += 1;
        if (gpsDenyResetTimer.current != null) window.clearTimeout(gpsDenyResetTimer.current);
        gpsDenyResetTimer.current = window.setTimeout(() => {
          gpsDenyStreak.current = 0;
        }, 90_000);
        if (gpsDenyStreak.current >= 2) void autoPunchOutForGpsOff();
      },
      trackOpts
    );
    const t = setInterval(flush, 8000);
    const ping = window.setInterval(() => {
      getFreshPosition()
        .then(recordFix)
        .catch(() => {
          navigator.geolocation.getCurrentPosition(recordFix, () => {}, trackOpts);
        });
    }, 15_000);
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        flush();
        return;
      }
      getFreshPosition()
        .then(recordFix)
        .catch(() => {
          navigator.geolocation.getCurrentPosition(recordFix, () => {}, trackOpts);
        });
      flush();
    };
    document.addEventListener("visibilitychange", onHide);

    let perm: PermissionStatus | null = null;
    const onPerm = () => {
      if (document.visibilityState !== "visible" || !perm || perm.state !== "denied") return;
      void autoPunchOutForGpsOff();
    };
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((status) => {
        perm = status;
        status.addEventListener("change", onPerm);
      })
      .catch(() => {});

    return () => {
      trackFixRef.current = null;
      navigator.geolocation.clearWatch(watch);
      clearInterval(t);
      window.clearInterval(ping);
      clearIntervalSnapshotTimers();
      if (intervalVisibilityHandler.current) {
        document.removeEventListener("visibilitychange", intervalVisibilityHandler.current);
        intervalVisibilityHandler.current = null;
      }
      document.removeEventListener("visibilitychange", onHide);
      perm?.removeEventListener("change", onPerm);
      if (gpsDenyResetTimer.current != null) window.clearTimeout(gpsDenyResetTimer.current);
      flush();
      wake?.release().catch(() => {});
    };
    // track only while this punch session is open
  }, [open?.id]);

  async function verifyFace(descriptor: number[]) {
    const res = await withTimeout(
      fetch("/api/face/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descriptor }),
      }),
      12000,
      "Face check timed out. Check network and tap Confirm again."
    );
    const data = await readApiJson<{ error?: string; matched?: boolean; hint?: string }>(res);
    if (!res.ok) throw new Error(data.error || "Face check failed.");
    if (!data.matched) {
      throw new Error(
        data.hint ||
          "Face did not match. Use bright light, look straight, or ask admin to clear face and register again."
      );
    }
  }

  async function onRegister(descriptor: number[], image: string, samples?: number[][]) {
    setBusy(true);
    try {
      const res = await fetch("/api/face/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descriptor, image, samples, usesTurban: registerTurban }),
      });
      const data = await readApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Could not save face.");
      setMode("idle");
      setOkMsg(true);
      setMsg(t("faceSaved"));
      refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save face.");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function punch(kind: "in" | "out", descriptor: number[], image: string) {
    setBusy(true);
    setMsg("");
    setOkMsg(false);
    try {
      try {
        assertNativeSecureForPunch();
      } catch (sec) {
        setMsg(sec instanceof Error ? sec.message : "Security check failed.");
        setBusy(false);
        throw sec;
      }

      await verifyFace(descriptor);

      if (kind === "out" && buffer.current.length) {
        const batch = buffer.current.splice(0, buffer.current.length);
        apiFetch("/api/attendance/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({ points: batch }),
        }).catch(() => {});
      }

      let fix: GpsFix = punchGpsRef.current || {
        lat: lastFix.current?.lat ?? livePos?.lat ?? 0,
        lng: lastFix.current?.lng ?? livePos?.lng ?? 0,
        accuracy: Number.isFinite(liveAcc.current) && liveAcc.current < 9000 ? liveAcc.current : null,
        at: Date.now(),
      };

      if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng) || (fix.lat === 0 && fix.lng === 0)) {
        setMsg(t("gpsLocating"));
        fix = await captureGpsFix(lastFix.current, liveAcc.current);
      }

      const payload = {
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        image,
        descriptor,
        gpsSamples: [fix],
      };
      const url = kind === "in" ? "/api/attendance" : "/api/attendance/punch-out";
      const res = await withTimeout(
        apiFetch(url, {
          method: "POST",
          body: JSON.stringify(payload),
        }),
        20000,
        "Punch timed out. Check network and try again."
      );
      const data = await readApiJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Could not save punch.");
      punchGpsRef.current = null;
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
      throw e instanceof Error ? e : new Error(text);
    } finally {
      setBusy(false);
    }
  }

  async function enableLocation() {
    setLocating(true);
    setGpsError("");
    try {
      const pos = open ? await getFreshPosition() : await locateDevice();
      if (open) {
        trackFixRef.current?.(pos);
      } else {
        startGeoTracking();
        applyPosition(pos, true);
      }
    } catch (e) {
      setGpsError(e instanceof Error ? e.message : "Could not get location.");
    } finally {
      setLocating(false);
    }
  }

  async function beginPunchIn() {
    setMsg("");
    setOkMsg(false);
    try {
      assertNativeSecureForPunch();
    } catch (sec) {
      setMsg(sec instanceof Error ? sec.message : "Security check failed.");
      return;
    }
    if (!punchInAllowed) {
      setMsg(t("punchInWindow"));
      return;
    }
    startGeoTracking();

    if (!lastFix.current && livePos) {
      lastFix.current = livePos;
    }

    if (lastFix.current || punchGpsRef.current) {
      setMode("in");
      captureGpsFix(lastFix.current, liveAcc.current)
        .then((gps) => {
          punchGpsRef.current = gps;
        })
        .catch(() => {});
      return;
    }

    setLocating(true);
    try {
      const gps = await withTimeout(
        captureGpsFix(lastFix.current, liveAcc.current),
        8000,
        "Could not find location. Tap Show my location below, allow Location, then Punch In."
      );
      punchGpsRef.current = gps;
      lastFix.current = { lat: gps.lat, lng: gps.lng };
      setLivePos({ lat: gps.lat, lng: gps.lng });
      setMode("in");
    } catch (e) {
      const text = e instanceof Error ? e.message : "Turn on GPS and try again.";
      setMsg(text);
      setGpsError(text);
    } finally {
      setLocating(false);
    }
  }

  function beginPunchOut() {
    setMsg("");
    setOkMsg(false);
    try {
      assertNativeSecureForPunch();
    } catch (sec) {
      setMsg(sec instanceof Error ? sec.message : "Security check failed.");
      return;
    }
    startGeoTracking();
    setMode("out");
  }

  const live = useMemo(() => {
    if (!open) return null;
    const start = new Date(open.punchInAt).getTime();
    const sessionMeters = sessionTravelMeters({
      punchIn: { lat: open.punchInLat, lng: open.punchInLng },
      punchInAt: open.punchInAt,
      points: open.points,
      live: livePos,
    });
    const otherToday = Math.max(0, todayDistanceMeters - (open.distanceMeters || 0));
    return {
      durationMs: todayPriorClosedMs + (Date.now() - start),
      points: open.points,
      travelMeters: otherToday + sessionMeters,
    };
  }, [open, livePos, todayDistanceMeters, todayPriorClosedMs]);

  async function logout() {
    await logoutUser();
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <BrandMark size={80} />
        {bootError ? (
          <>
            <p className="max-w-sm text-sm text-red-700">{bootError}</p>
            <button
              type="button"
              onClick={() => {
                setBooting(true);
                setBootError("");
                void refresh();
              }}
              className="rounded-xl bg-teal px-5 py-2.5 text-sm font-semibold text-white"
            >
              Try again
            </button>
            <button type="button" onClick={logout} className="text-sm text-navy/50">
              {t("logout")}
            </button>
          </>
        ) : (
          <p>{booting ? t("loading") : t("loading")}</p>
        )}
      </div>
    );
  }

  return (
    <main className="native-safe-top native-safe-bottom min-h-screen overflow-x-hidden bg-sand">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <NativeLocationBanner punchedIn={Boolean(open)} punchInAt={open?.punchInAt} />
        <header className="mb-4 flex flex-wrap items-start justify-between gap-2 rounded-3xl bg-white px-4 py-3 shadow-card">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <BrandMark size={56} />
            <div className="min-w-0">
              <p className="truncate text-xs uppercase tracking-wider text-navy/50">{t("aap")}</p>
              <h1 className="truncate text-base font-semibold sm:text-lg">{user.name}</h1>
              <p className="truncate text-sm text-navy/60">
                {user.sectorAllotted} · {user.assemblyName}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <LangToggle tone="light" />
            <button onClick={logout} className="whitespace-nowrap text-sm text-navy/50">
              {t("logout")}
            </button>
          </div>
        </header>

        {gpsOffFlag && (
          <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-semibold">{t("gpsOffTitle")}</p>
            <p className="mt-1">{t("gpsOffFlag")}</p>
          </div>
        )}
        {msg && (
          <p
            className={`mb-3 break-words rounded-2xl px-4 py-2 text-sm ${
              okMsg ? "bg-white text-teal" : "bg-red-50 text-red-700"
            }`}
          >
            {msg}
          </p>
        )}

        {mode !== "idle" && (
          <div className="mb-4 overflow-hidden rounded-[2rem] bg-white p-4 shadow-card sm:p-6">
            <FaceCapture
              busy={busy}
              mode={mode === "register" ? "register" : "verify"}
              turbanMode={mode === "register" ? registerTurban : Boolean(user?.usesTurban)}
              actionLabel={mode === "register" ? t("saveFace") : mode === "in" ? t("confirmIn") : t("confirmOut")}
              onCapture={(d, image, samples) =>
                mode === "register" ? onRegister(d, image, samples) : punch(mode, d, image)
              }
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
              <div className="flex flex-col gap-3">
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-navy/10 bg-sand/40 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={registerTurban}
                    onChange={(e) => setRegisterTurban(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-navy/20"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-navy">{t("turbanModeLabel")}</span>
                    <span className="mt-0.5 block text-xs text-navy/55">{t("turbanModeHint")}</span>
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    startGeoTracking();
                    setMode("register");
                  }}
                  className="w-full rounded-2xl bg-navy px-5 py-4 text-base font-semibold text-white"
                >
                  {t("registerFace")}
                </button>
              </div>
            ) : open ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={beginPunchOut}
                  className="w-full rounded-2xl bg-ink px-5 py-4 text-base font-semibold text-white sm:w-auto sm:min-w-[200px]"
                >
                  {t("punchOut")}
                </button>
                <span className="min-w-0 break-words text-sm text-navy/60">
                  {t("live")} · {formatDuration(live?.durationMs || 0)} · {formatKm(live?.travelMeters || 0)}
                </span>
                <p className="text-xs text-amber-800">
                  {isNativeApp() ? t("nativeGpsActive") : t("nativeGpsBrowserHint")}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={beginPunchIn}
                  disabled={locating || !punchInAllowed}
                  className="w-full rounded-2xl bg-teal px-5 py-4 text-base font-semibold text-white disabled:opacity-70"
                >
                  {locating ? t("gpsLocating") : t("punchIn")}
                </button>
                {!punchInAllowed ? (
                  <p className="text-center text-xs font-medium text-amber-800 sm:text-left">{t("punchInWindow")}</p>
                ) : punchInHint ? (
                  <p className="text-center text-xs font-medium text-teal sm:text-left">{punchInHint}</p>
                ) : (
                  <p className="text-center text-xs text-navy/45 sm:text-left">{t("punchStart")}</p>
                )}
              </div>
            )}
          </div>
        )}

        {!livePos && mode === "idle" && !open && (
          <div className="mb-3 rounded-2xl border border-teal/25 bg-teal/5 p-4">
            <p className="text-sm font-semibold text-navy">{t("enableLocationTitle")}</p>
            <p className="mt-1 text-xs text-navy/60">{t("enableLocationHint")}</p>
            <button
              type="button"
              onClick={enableLocation}
              disabled={locating}
              className="mt-3 w-full rounded-xl bg-teal px-4 py-3 text-sm font-semibold text-white disabled:opacity-70"
            >
              {locating ? t("findingLocation") : t("showMyLocation")}
            </button>
          </div>
        )}

        <div className="overflow-hidden rounded-[2rem] bg-white shadow-float">
          {open ? (
            <div className="h-[min(48vh,400px)] min-h-[240px] overflow-hidden">
              <RouteMap
                points={open.points}
                punchIn={{ lat: open.punchInLat, lng: open.punchInLng }}
                liveLocation={livePos}
                locating={locating}
                locationError={gpsError}
                onLocateMe={enableLocation}
                refreshGpsLabel={t("refreshGps")}
                updatingGpsLabel={t("pleaseWait")}
                durationMs={live?.durationMs}
                distanceMeters={live?.travelMeters}
              />
            </div>
          ) : (
            <div className="h-[min(40vh,360px)] min-h-[220px] overflow-hidden">
              <RouteMap
                points={[]}
                liveLocation={livePos}
                locating={locating}
                locationError={gpsError}
                onLocateMe={enableLocation}
              />
            </div>
          )}
        </div>

        {!inNativeApp && (
          <>
            <a
              href={LATEST_NATIVE_APK}
              download="AAP-Attendance-native.apk"
              className="mt-3 flex items-center justify-between rounded-2xl border border-navy/10 bg-navy px-4 py-3 text-white shadow-card"
            >
              <div>
                <p className="font-semibold">{t("installApp")}</p>
                <p className="text-sm text-white/75">{t("installAppHint")}</p>
              </div>
              <span className="shrink-0 rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold">{t("downloadApk")}</span>
            </a>
            <div className="mt-3 rounded-2xl border border-navy/10 bg-white px-4 py-3 shadow-card">
              <p className="font-semibold">{t("installAppIos")}</p>
              <p className="text-sm text-navy/55">{t("installAppIosHint")}</p>
            </div>
          </>
        )}

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
