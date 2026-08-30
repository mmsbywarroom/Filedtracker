"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { locateDevice } from "@/lib/deviceGeo";
import { countHeads, countHeadsFromDataUrl, loadHeadCountModels } from "@/lib/face";

const PA = {
  title: "ਰੈਲੀ ਫੋਟੋ",
  hello: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ",
  venue: "ਵੇਨਿਊ",
  capture: "ਫੋਟੋ ਖਿੱਚੋ",
  upload: "ਫੋਟੋ ਅਪਲੋਡ ਕਰੋ",
  sending: "ਭੇਜਿਆ ਜਾ ਰਿਹਾ…",
  locating: "ਲੋਕੇਸ਼ਨ ਲੈ ਰਹੇ ਹਾਂ…",
  counting: "ਸਿਰ ਗਿਣ ਰਹੇ ਹਾਂ…",
  heads: "ਸਿਰ ਗਿਣਤੀ",
  eta: "ਪਹੁੰਚਣ ਦਾ ਸਮਾਂ",
  remaining: "ਬਾਕੀ ਸਮਾਂ",
  done: "ਫੋਟੋ ਭੇਜੀ ਗਈ। ਸਫ਼ਰ ਸ਼ੁਰੂ ਮੰਨਿਆ ਗਿਆ।",
  needGps: "ਲੋਕੇਸ਼ਨ ਚਾਲੂ ਕਰੋ, ਫਿਰ ਫੋਟੋ ਭੇਜੋ।",
  noRally: "ਰੈਲੀ ਵੇਨਿਊ ਹਾਲੇ ਸੈੱਟ ਨਹੀਂ ਹੈ। ਐਡਮਿਨ ਨਾਲ ਸੰਪਰਕ ਕਰੋ।",
  cam: "ਕੈਮਰਾ ਖੋਲ੍ਹੋ",
  retake: "ਦੁਬਾਰਾ ਖਿੱਚੋ",
  send: "ਭੇਜੋ",
  logout: "ਲਾਗਆਉਟ",
  hint: "ਗੱਡੀ ਵਾਲੀ ਫੋਟੋ ਖਿੱਚੋ ਜਾਂ ਅਪਲੋਡ ਕਰੋ। ਸਿਰ ਆਪਣੇ ਆਪ ਗਿਣੇ ਜਾਣਗੇ।",
};

function toJpeg(source: HTMLVideoElement | HTMLImageElement) {
  const canvas = document.createElement("canvas");
  const w = "videoWidth" in source ? source.videoWidth : source.naturalWidth;
  const h = "videoHeight" in source ? source.videoHeight : source.naturalHeight;
  if (!w || !h) return "";
  const scale = Math.min(1, 960 / Math.max(w, h));
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

export default function RallyCapturePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [name, setName] = useState("");
  const [rallyName, setRallyName] = useState("");
  const [preview, setPreview] = useState("");
  const [heads, setHeads] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [last, setLast] = useState<{ etaLabel: string; remainingLabel: string; headCount: number } | null>(null);
  const [camOn, setCamOn] = useState(false);

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
    const html = document.documentElement;
    html.classList.add("lang-pa");
    html.lang = "pa";
    void loadMe();
    void loadHeadCountModels().catch(() => {});
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [loadMe]);

  async function startCam() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamOn(true);
    } catch {
      setErr("ਕੈਮਰਾ ਖੋਲ੍ਹਣ ਵਿੱਚ ਸਮੱਸਿਆ। ਇਜਾਜ਼ਤ ਦਿਓ ਜਾਂ ਫੋਟੋ ਅਪਲੋਡ ਕਰੋ।");
    }
  }

  async function countFromDataUrl(dataUrl: string) {
    setHeads(null);
    setMsg(PA.counting);
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
    try {
      const n = await countHeads(video);
      const dataUrl = toJpeg(video);
      if (!dataUrl) return;
      setPreview(dataUrl);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setCamOn(false);
      setHeads(n);
    } catch {
      const dataUrl = toJpeg(video);
      if (!dataUrl) return;
      setPreview(dataUrl);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      setCamOn(false);
      await countFromDataUrl(dataUrl);
    }
  }

  async function onFile(file: File) {
    setErr("");
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    let n = 0;
    try {
      n = await countHeads(img);
    } catch {
      n = 0;
    }
    const dataUrl = toJpeg(img);
    URL.revokeObjectURL(url);
    if (!dataUrl) return;
    setPreview(dataUrl);
    setHeads(n);
  }

  async function submit() {
    if (!preview) return;
    setBusy(true);
    setErr("");
    setMsg(PA.locating);
    try {
      let people = heads;
      if (people == null || people === 0) {
        setMsg(PA.counting);
        people = await countHeadsFromDataUrl(preview).catch(() => 0);
        setHeads(people);
      }
      const pos = await locateDevice();
      setMsg(PA.sending);
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
        setErr(data.error || "ਭੇਜ ਨਹੀਂ ਸਕੇ।");
        return;
      }
      setMsg(PA.done);
      setPreview("");
      setHeads(null);
      await loadMe();
    } catch {
      setErr(PA.needGps);
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
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <BrandMark size={44} tone="onDark" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-bright">ਆਮ ਆਦਮੀ ਪਾਰਟੀ</p>
              <h1 className="text-base font-semibold">{PA.title}</h1>
            </div>
          </div>
          <button type="button" onClick={logout} className="rounded-lg border border-white/20 px-3 py-1.5 text-sm">
            {PA.logout}
          </button>
        </div>
      </header>

      <section className="mx-auto max-w-lg px-4 py-6">
        <div className="rounded-[1.75rem] bg-white p-5 shadow-float">
          <p className="text-lg font-semibold text-ink">
            {PA.hello}, {name}
          </p>
          <p className="mt-1 text-sm text-navy/60">
            {PA.venue}: {rallyName || "—"}
          </p>
          <p className="mt-3 text-sm text-navy/70">{PA.hint}</p>

          {last && (
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-sand px-2 py-3">
                <p className="text-navy/50">{PA.heads}</p>
                <p className="mt-1 text-lg font-semibold">{last.headCount}</p>
              </div>
              <div className="rounded-xl bg-sand px-2 py-3">
                <p className="text-navy/50">{PA.eta}</p>
                <p className="mt-1 text-sm font-semibold">{last.etaLabel}</p>
              </div>
              <div className="rounded-xl bg-sand px-2 py-3">
                <p className="text-navy/50">{PA.remaining}</p>
                <p className="mt-1 text-sm font-semibold">{last.remainingLabel}</p>
              </div>
            </div>
          )}

          <video ref={videoRef} playsInline muted className={`mt-4 w-full rounded-2xl bg-black ${camOn ? "block" : "hidden"}`} />

          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="mt-4 w-full rounded-2xl object-cover" />
          )}

          {heads != null && preview && (
            <p className="mt-2 text-sm font-medium text-teal">
              {PA.heads}: {heads}
            </p>
          )}

          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
          {msg && !err && <p className="mt-3 text-sm text-teal">{msg}</p>}
          {!rallyName && <p className="mt-3 text-sm text-amber-700">{PA.noRally}</p>}

          <div className="mt-4 flex flex-col gap-2">
            {!camOn && !preview && (
              <button type="button" onClick={startCam} className="w-full rounded-2xl bg-teal py-3 font-semibold text-white">
                {PA.cam}
              </button>
            )}
            {camOn && (
              <button type="button" onClick={snap} className="w-full rounded-2xl bg-teal py-3 font-semibold text-white">
                {PA.capture}
              </button>
            )}
            {preview && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={submit}
                  className="w-full rounded-2xl bg-teal py-3 font-semibold text-white disabled:opacity-40"
                >
                  {busy ? PA.sending : PA.send}
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
                  {PA.retake}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-2xl border border-navy/15 py-3 font-semibold"
            >
              {PA.upload}
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
