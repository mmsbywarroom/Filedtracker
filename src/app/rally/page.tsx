"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { locateDevice } from "@/lib/deviceGeo";
import { countHeadsFromDataUrl, fileToJpegDataUrl, loadPersonCountModel } from "@/lib/headCount";

type Lang = "pa" | "en";

const COPY = {
  pa: {
    aap: "ਆਮ ਆਦਮੀ ਪਾਰਟੀ",
    title: "ਰੈਲੀ ਚੈੱਕ-ਇਨ",
    hello: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ",
    venue: "ਵੇਨਿਊ",
    capture: "ਫੋਟੋ ਖਿੱਚੋ",
    upload: "ਫੋਟੋ ਅਪਲੋਡ ਕਰੋ",
    sending: "ਭੇਜਿਆ ਜਾ ਰਿਹਾ…",
    locating: "ਲੋਕੇਸ਼ਨ ਲੈ ਰਹੇ ਹਾਂ…",
    counting: "ਲੋਕ ਗਿਣ ਰਹੇ ਹਾਂ…",
    heads: "ਲੋਕ ਗਿਣਤੀ",
    eta: "ਪਹੁੰਚਣ ਦਾ ਸਮਾਂ",
    remaining: "ਬਾਕੀ ਸਮਾਂ",
    done: "ਫੋਟੋ ਭੇਜੀ ਗਈ। ਸਫ਼ਰ ਸ਼ੁਰੂ ਮੰਨਿਆ ਗਿਆ।",
    needGps: "ਲੋਕੇਸ਼ਨ ਚਾਲੂ ਕਰੋ, ਫਿਰ ਫੋਟੋ ਭੇਜੋ।",
    noRally: "ਰੈਲੀ ਵੇਨਿਊ ਹਾਲੇ ਸੈੱਟ ਨਹੀਂ ਹੈ। ਐਡਮਿਨ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।",
    opensOn: "ਰੈਲੀ ਇਸ ਤਾਰੀਖ ਨੂੰ ਹੈ",
    cam: "ਕੈਮਰਾ ਖੋਲ੍ਹੋ",
    retake: "ਦੁਬਾਰਾ ਖਿੱਚੋ",
    send: "ਭੇਜੋ",
    logout: "ਲਾਗਆਉਟ",
    flip: "ਕੈਮਰਾ ਬਦਲੋ",
    camErr: "ਕੈਮਰਾ ਖੋਲ੍ਹਣ ਵਿੱਚ ਸਮੱਸਿਆ। ਇਜਾਜ਼ਤ ਦਿਓ ਜਾਂ ਫੋਟੋ ਅਪਲੋਡ ਕਰੋ।",
    sendErr: "ਭੇਜ ਨਹੀਂ ਸਕੇ।",
    hint: "ਬੱਸ, ਕਾਰ, ਟੈਂਪੋ, ਟਰੈਕਟਰ — ਕਿਸੇ ਵੀ ਗੱਡੀ ਜਾਂ ਥਾਂ ਦੀ ਫੋਟੋ ਖਿੱਚੋ। ਲੋਕ ਆਪਣੇ ਆਪ ਗਿਣੇ ਜਾਣਗੇ।",
    stepPhoto: "1 · ਫੋਟੋ",
    stepSend: "2 · ਭੇਜੋ",
    stepTrack: "3 · ਰਸਤਾ",
    reached: "ਤੁਸੀਂ ਵੇਨਿਊ ਪਹੁੰਚ ਗਏ ਹੋ",
    maps: "ਨਕਸ਼ੇ ਵਿੱਚ ਖੋਲ੍ਹੋ",
    tracking: "ਰਸਤਾ ਟ੍ਰੈਕ ਹੋ ਰਿਹਾ ਹੈ (ਐਪ ਖੁੱਲ੍ਹੀ ਰੱਖੋ)",
  },
  en: {
    aap: "Aam Aadmi Party",
    title: "Rally check-in",
    hello: "Hello",
    venue: "Venue",
    capture: "Take photo",
    upload: "Upload photo",
    sending: "Sending…",
    locating: "Getting location…",
    counting: "Counting people…",
    heads: "People count",
    eta: "Time to arrive",
    remaining: "Time left",
    done: "Photo sent. Journey started.",
    needGps: "Turn on Location, then send the photo.",
    noRally: "Rally venue is not set. Contact admin.",
    opensOn: "Rally is on",
    cam: "Open camera",
    retake: "Retake",
    send: "Send",
    logout: "Logout",
    flip: "Flip camera",
    camErr: "Could not open camera. Allow permission or upload a photo.",
    sendErr: "Could not send.",
    hint: "Photo from any vehicle or place — bus, car, tempo, tractor. People are counted automatically.",
    stepPhoto: "1 · Photo",
    stepSend: "2 · Send",
    stepTrack: "3 · Track",
    reached: "You have reached the venue",
    maps: "Open in Maps",
    tracking: "Tracking your journey (keep this page open)",
  },
};

function toJpeg(source: HTMLVideoElement | HTMLImageElement) {
  const canvas = document.createElement("canvas");
  const w = "videoWidth" in source ? source.videoWidth : source.naturalWidth;
  const h = "videoHeight" in source ? source.videoHeight : source.naturalHeight;
  if (!w || !h) return "";
  const scale = Math.min(1, 1280 / Math.max(w, h));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export default function RallyCapturePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [lang, setLang] = useState<Lang>("pa");
  const t = COPY[lang];
  const [name, setName] = useState("");
  const [rallyName, setRallyName] = useState("");
  const [rallyLat, setRallyLat] = useState<number | null>(null);
  const [rallyLng, setRallyLng] = useState<number | null>(null);
  const [rallyOpensOn, setRallyOpensOn] = useState("");
  const [preview, setPreview] = useState("");
  const [heads, setHeads] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [last, setLast] = useState<{
    etaLabel: string;
    remainingLabel: string;
    headCount: number;
    reached: boolean;
  } | null>(null);
  const [camOn, setCamOn] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");

  const loadMe = useCallback(async () => {
    const res = await fetch("/api/rally/me", { cache: "no-store" });
    if (res.status === 401) {
      window.location.replace("/?relogin=1");
      return;
    }
    const data = await res.json();
    setName(data.user?.name || "");
    setRallyName(data.rally?.name || "");
    setRallyLat(typeof data.rally?.lat === "number" ? data.rally.lat : null);
    setRallyLng(typeof data.rally?.lng === "number" ? data.rally.lng : null);
    setRallyOpensOn(data.rallyOpensOn || "");
    if (data.last) {
      setLast({
        etaLabel: data.last.etaLabel,
        remainingLabel: data.last.remainingLabel,
        headCount: data.last.headCount,
        reached: Boolean(data.last.reached),
      });
    } else {
      setLast(null);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("ft_rally_lang");
    if (saved === "en" || saved === "pa") setLang(saved);
    else setLang("pa");
  }, []);

  useEffect(() => {
    localStorage.setItem("ft_rally_lang", lang);
    document.documentElement.lang = lang;
    document.documentElement.classList.toggle("lang-pa", lang === "pa");
  }, [lang]);

  useEffect(() => {
    void loadMe();
    void loadPersonCountModel().catch(() => {});
    return () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, [loadMe]);

  useEffect(() => {
    if (!last || last.reached) return;
    let alive = true;
    async function ping() {
      if (!alive || document.visibilityState === "hidden") return;
      try {
        const pos = await locateDevice();
        if (!alive) return;
        const res = await fetch("/api/rally/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        });
        if (res.ok) void loadMe();
      } catch {
        /* GPS denied — stay at last known */
      }
    }
    void ping();
    const timer = window.setInterval(() => void ping(), 25000);
    const onVis = () => {
      if (document.visibilityState === "visible") void ping();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [last, loadMe]);

  async function startCam(mode: "environment" | "user" = facing) {
    setErr("");
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode } },
        audio: false,
      });
      streamRef.current = stream;
      setFacing(mode);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamOn(true);
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCamOn(true);
      } catch {
        setErr(t.camErr);
      }
    }
  }

  async function flipCam() {
    const next = facing === "environment" ? "user" : "environment";
    await startCam(next);
  }

  async function countFromDataUrl(dataUrl: string) {
    setHeads(null);
    setMsg(t.counting);
    try {
      const n = await countHeadsFromDataUrl(dataUrl);
      setHeads(n);
      setMsg("");
    } catch {
      setHeads(0);
      setMsg("");
    }
  }

  async function snap() {
    const video = videoRef.current;
    if (!video) return;
    const dataUrl = toJpeg(video);
    if (!dataUrl) return;
    setPreview(dataUrl);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    setCamOn(false);
    await countFromDataUrl(dataUrl);
  }

  async function onFile(file: File) {
    setErr("");
    const dataUrl = await fileToJpegDataUrl(file);
    if (!dataUrl) return;
    setPreview(dataUrl);
    await countFromDataUrl(dataUrl);
  }

  async function submit() {
    if (!preview) return;
    setBusy(true);
    setErr("");
    setMsg(t.locating);
    try {
      let people = heads;
      if (people == null || people === 0) {
        setMsg(t.counting);
        people = await countHeadsFromDataUrl(preview).catch(() => 0);
        setHeads(people);
      }
      const pos = await locateDevice();
      setMsg(t.sending);
      const res = await fetch("/api/rally/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photo: preview,
          headCount: people ?? 0,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || t.sendErr);
        return;
      }
      setMsg(t.done);
      setPreview("");
      setHeads(null);
      await loadMe();
    } catch {
      setErr(t.needGps);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/?relogin=1";
  }

  const mapsHref =
    rallyLat != null && rallyLng != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${rallyLat},${rallyLng}`
      : null;

  const stepIndex = last ? 2 : preview ? 1 : 0;

  return (
    <main className="native-safe-bottom min-h-[100dvh] bg-sand">
      <header className="app-header-safe bg-ink text-white">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-2 px-4 py-3 sm:max-w-xl md:max-w-2xl">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark size={44} tone="onDark" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-bright">{t.aap}</p>
              <h1 className="truncate text-base font-semibold sm:text-lg">{t.title}</h1>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="inline-flex rounded-full bg-white/15 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLang("en")}
                className={`rounded-full px-2.5 py-1 ${lang === "en" ? "bg-teal-bright text-ink" : "text-white/80"}`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang("pa")}
                className={`rounded-full px-2.5 py-1 ${lang === "pa" ? "bg-teal-bright text-ink" : "text-white/80"}`}
              >
                ਪੰ
              </button>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-white/20 px-3 py-2 text-sm font-medium"
            >
              {t.logout}
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-lg px-4 py-5 sm:max-w-xl sm:py-6 md:max-w-2xl">
        <div className="mb-4 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold uppercase tracking-wide text-navy/45 sm:text-xs">
          {[t.stepPhoto, t.stepSend, t.stepTrack].map((label, i) => (
            <div
              key={label}
              className={`rounded-xl px-2 py-2 ${
                i <= stepIndex ? "bg-teal text-white" : "bg-white/80 text-navy/40 shadow-sm"
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="rounded-[1.75rem] bg-white p-5 shadow-float sm:p-6 md:p-8">
          <p className="text-xl font-semibold text-ink sm:text-2xl">
            {t.hello}, {name || "—"}
          </p>
          <p className="mt-1 text-sm text-navy/60 sm:text-base">
            {t.venue}: <span className="font-medium text-navy/80">{rallyName || "—"}</span>
          </p>
          {mapsHref && rallyName ? (
            <a
              href={mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex text-sm font-semibold text-teal underline-offset-2 hover:underline"
            >
              {t.maps}
            </a>
          ) : null}
          <p className="mt-3 text-sm leading-relaxed text-navy/70">{t.hint}</p>

          {last?.reached ? (
            <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-4 text-center text-emerald-800">
              <p className="text-lg font-semibold">{t.reached}</p>
            </div>
          ) : null}

          {last && (
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs sm:gap-3">
              <div className="rounded-2xl bg-sand px-2 py-3 sm:py-4">
                <p className="text-navy/50">{t.heads}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{last.headCount}</p>
              </div>
              <div className="rounded-2xl bg-sand px-2 py-3 sm:py-4">
                <p className="text-navy/50">{t.eta}</p>
                <p className="mt-1 text-sm font-semibold sm:text-base">{last.etaLabel}</p>
              </div>
              <div className="rounded-2xl bg-sand px-2 py-3 sm:py-4">
                <p className="text-navy/50">{t.remaining}</p>
                <p className="mt-1 text-sm font-semibold sm:text-base">{last.remainingLabel}</p>
              </div>
            </div>
          )}

          {last && !last.reached ? (
            <p className="mt-3 text-center text-xs font-medium text-teal sm:text-sm">{t.tracking}</p>
          ) : null}

          <div className="relative mt-4 overflow-hidden rounded-2xl bg-ink/90">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`aspect-[3/4] w-full object-cover sm:aspect-[4/5] ${camOn ? "block" : "hidden"} ${
                facing === "user" ? "scale-x-[-1]" : ""
              }`}
            />
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="aspect-[3/4] w-full object-cover sm:aspect-[4/5]" />
            ) : null}
            {!camOn && !preview ? (
              <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 px-6 text-center text-white/60 sm:aspect-[4/5]">
                <BrandMark size={56} tone="onDark" />
                <p className="text-sm">{t.stepPhoto}</p>
              </div>
            ) : null}
          </div>

          {heads != null && preview && (
            <p className="mt-3 text-sm font-semibold text-teal sm:text-base">
              {t.heads}: {heads}
            </p>
          )}

          {err && <p className="mt-3 text-sm font-medium text-red-600">{err}</p>}
          {msg && !err && <p className="mt-3 text-sm font-medium text-teal">{msg}</p>}
          {!rallyName && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {rallyOpensOn ? `${t.opensOn} ${rallyOpensOn}` : t.noRally}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-3">
            {!camOn && !preview && (
              <button
                type="button"
                onClick={() => startCam()}
                className="min-h-[52px] w-full rounded-2xl bg-teal py-3.5 text-base font-semibold text-white shadow-sm"
              >
                {t.cam}
              </button>
            )}
            {camOn && (
              <>
                <button
                  type="button"
                  onClick={snap}
                  className="min-h-[52px] w-full rounded-2xl bg-teal py-3.5 text-base font-semibold text-white"
                >
                  {t.capture}
                </button>
                <button
                  type="button"
                  onClick={flipCam}
                  className="min-h-[48px] w-full rounded-2xl border border-navy/15 py-3 font-semibold"
                >
                  {t.flip} · {facing === "environment" ? "Back" : "Front"}
                </button>
              </>
            )}
            {preview && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={submit}
                  className="min-h-[52px] w-full rounded-2xl bg-teal py-3.5 text-base font-semibold text-white disabled:opacity-40"
                >
                  {busy ? t.sending : t.send}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setPreview("");
                    setHeads(null);
                  }}
                  className="min-h-[48px] w-full rounded-2xl border border-navy/15 py-3 font-semibold"
                >
                  {t.retake}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="min-h-[48px] w-full rounded-2xl border border-navy/15 py-3 font-semibold"
            >
              {t.upload}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
