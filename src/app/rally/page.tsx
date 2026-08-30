"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { locateDevice } from "@/lib/deviceGeo";
import { countHeadsFromDataUrl, fileToJpegDataUrl, loadPersonCountModel } from "@/lib/headCount";

type Lang = "pa" | "en";

const COPY = {
  pa: {
    aap: "ਆਮ ਆਦਮੀ ਪਾਰਟੀ",
    title: "ਰੈਲੀ ਫੋਟੋ",
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
    cam: "ਕੈਮਰਾ ਖੋਲ੍ਹੋ",
    retake: "ਦੁਬਾਰਾ ਖਿੱਚੋ",
    send: "ਭੇਜੋ",
    logout: "ਲਾਗਆਉਟ",
    flip: "ਕੈਮਰਾ ਬਦਲੋ",
    camErr: "ਕੈਮਰਾ ਖੋਲ੍ਹਣ ਵਿੱਚ ਸਮੱਸਿਆ। ਇਜਾਜ਼ਤ ਦਿਓ ਜਾਂ ਫੋਟੋ ਅਪਲੋਡ ਕਰੋ।",
    sendErr: "ਭੇਜ ਨਹੀਂ ਸਕੇ।",
    hint: "ਬੱਸ, ਕਾਰ, ਟੈਂਪੋ, ਟਰੈਕਟਰ — ਕਿਸੇ ਵੀ ਗੱਡੀ ਜਾਂ ਥਾਂ ਦੀ ਫੋਟੋ ਖਿੱਚੋ। ਲੋਕ ਆਪਣੇ ਆਪ ਗਿਣੇ ਜਾਣਗੇ।",
  },
  en: {
    aap: "Aam Aadmi Party",
    title: "Rally photo",
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
    cam: "Open camera",
    retake: "Retake",
    send: "Send",
    logout: "Logout",
    flip: "Flip camera",
    camErr: "Could not open camera. Allow permission or upload a photo.",
    sendErr: "Could not send.",
    hint: "Photo from any vehicle or place — bus, car, tempo, tractor. People are counted automatically.",
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
  const [preview, setPreview] = useState("");
  const [heads, setHeads] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [last, setLast] = useState<{ etaLabel: string; remainingLabel: string; headCount: number } | null>(null);
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
    if (data.last) {
      setLast({
        etaLabel: data.last.etaLabel,
        remainingLabel: data.last.remainingLabel,
        headCount: data.last.headCount,
      });
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

  return (
    <main className="min-h-screen bg-sand">
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <BrandMark size={44} tone="onDark" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-bright">{t.aap}</p>
              <h1 className="truncate text-base font-semibold">{t.title}</h1>
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
            <button type="button" onClick={logout} className="rounded-lg border border-white/20 px-3 py-1.5 text-sm">
              {t.logout}
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-lg px-4 py-6">
        <div className="rounded-[1.75rem] bg-white p-5 shadow-float">
          <p className="text-lg font-semibold text-ink">
            {t.hello}, {name}
          </p>
          <p className="mt-1 text-sm text-navy/60">
            {t.venue}: {rallyName || "—"}
          </p>
          <p className="mt-3 text-sm text-navy/70">{t.hint}</p>

          {last && (
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-sand px-2 py-3">
                <p className="text-navy/50">{t.heads}</p>
                <p className="mt-1 text-lg font-semibold">{last.headCount}</p>
              </div>
              <div className="rounded-xl bg-sand px-2 py-3">
                <p className="text-navy/50">{t.eta}</p>
                <p className="mt-1 text-sm font-semibold">{last.etaLabel}</p>
              </div>
              <div className="rounded-xl bg-sand px-2 py-3">
                <p className="text-navy/50">{t.remaining}</p>
                <p className="mt-1 text-sm font-semibold">{last.remainingLabel}</p>
              </div>
            </div>
          )}

          <video
            ref={videoRef}
            playsInline
            muted
            className={`mt-4 w-full rounded-2xl bg-black ${camOn ? "block" : "hidden"} ${facing === "user" ? "scale-x-[-1]" : ""}`}
          />

          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="mt-4 w-full rounded-2xl object-cover" />
          )}

          {heads != null && preview && (
            <p className="mt-2 text-sm font-medium text-teal">
              {t.heads}: {heads}
            </p>
          )}

          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
          {msg && !err && <p className="mt-3 text-sm text-teal">{msg}</p>}
          {!rallyName && <p className="mt-3 text-sm text-amber-700">{t.noRally}</p>}

          <div className="mt-4 flex flex-col gap-2">
            {!camOn && !preview && (
              <button type="button" onClick={() => startCam()} className="w-full rounded-2xl bg-teal py-3 font-semibold text-white">
                {t.cam}
              </button>
            )}
            {camOn && (
              <>
                <button type="button" onClick={snap} className="w-full rounded-2xl bg-teal py-3 font-semibold text-white">
                  {t.capture}
                </button>
                <button type="button" onClick={flipCam} className="w-full rounded-2xl border border-navy/15 py-3 font-semibold">
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
                  className="w-full rounded-2xl bg-teal py-3 font-semibold text-white disabled:opacity-40"
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
                  className="w-full rounded-2xl border border-navy/15 py-3 font-semibold"
                >
                  {t.retake}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-2xl border border-navy/15 py-3 font-semibold"
            >
              {t.upload}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
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
