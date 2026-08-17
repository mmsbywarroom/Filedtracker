"use client";

import { useEffect, useRef, useState } from "react";
import { loadFaceModels, scanFace, type FaceScan } from "@/lib/face";

type Props = {
  actionLabel: string;
  onCapture: (descriptor: number[], image: string) => Promise<void> | void;
  busy?: boolean;
};

const hints = {
  no_face: "Phone ko chehre ke saamne rakho",
  too_far: "Thoda kareeb aao",
  multiple: "Frame mein sirf aap hon",
};

function snapshot(video: HTMLVideoElement, box?: { x: number; y: number; width: number; height: number }) {
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  if (box) {
    const pad = 0.2;
    const x = Math.max(0, box.x - box.width * pad);
    const y = Math.max(0, box.y - box.height * pad);
    const w = Math.min(video.videoWidth - x, box.width * (1 + pad * 2));
    const h = Math.min(video.videoHeight - y, box.height * (1 + pad * 2));
    ctx.drawImage(video, x, y, w, h, 0, 0, 240, 240);
  } else {
    const size = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, 240, 240);
  }
  return canvas.toDataURL("image/jpeg", 0.7);
}

export function FaceCapture({ actionLabel, onCapture, busy }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastGood = useRef<FaceScan | null>(null);
  const firing = useRef(false);
  const hits = useRef(0);
  const [camReady, setCamReady] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("Camera khul raha hai…");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled || !videoRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        setCamReady(true);
        setError("");
        setHint("Face unlock taiyar ho raha hai…");
      } catch {
        setError("Camera Allow karo: Chrome site settings → Camera → Allow.");
        return;
      }
      try {
        await loadFaceModels();
        if (cancelled) return;
        setModelsReady(true);
        setHint("Phone unlock ki tarah camera dekho");
      } catch {
        if (!cancelled) setHint("Face scan load nahi hua. Page refresh karo.");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function submit(result: FaceScan) {
    if (!result.ok || !videoRef.current || firing.current || busy) return;
    firing.current = true;
    setLocked(true);
    setHint("Face locked");
    const image = snapshot(videoRef.current, result.box);
    try {
      await onCapture(result.descriptor, image);
    } catch (e) {
      firing.current = false;
      setLocked(false);
      hits.current = 0;
      setHint(e instanceof Error ? e.message : "Dobara camera dekho");
    }
  }

  useEffect(() => {
    if (!camReady || !modelsReady || busy || firing.current) return;
    let running = false;
    let timer = 0;
    const tick = async () => {
      if (running || !videoRef.current || firing.current) return;
      running = true;
      const result = await scanFace(videoRef.current);
      if (result.ok) {
        lastGood.current = result;
        hits.current += 1;
        setHint("Face mil gaya…");
        if (hits.current >= 2) await submit(result);
      } else {
        hits.current = 0;
        lastGood.current = null;
        setHint(hints[result.error]);
      }
      running = false;
    };
    timer = window.setInterval(tick, 280);
    tick();
    return () => clearInterval(timer);
  }, [camReady, modelsReady, busy]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className={`relative aspect-[3/4] w-full max-w-xs overflow-hidden rounded-[1.75rem] border-4 bg-black shadow-float ${
          locked ? "border-emerald-400 ring-4 ring-emerald-300/50" : "border-white ring-4 ring-teal/30"
        }`}
      >
        <video ref={videoRef} className="h-full w-full object-cover scale-x-[-1]" playsInline muted autoPlay />
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className={`h-40 w-40 rounded-full border-4 ${locked ? "border-emerald-400" : "border-white/80"}`} />
        </div>
        {!camReady && (
          <div className="absolute inset-0 grid place-items-center bg-navy/80 text-white text-sm">Starting camera…</div>
        )}
      </div>
      <p className="text-center text-sm font-medium text-navy/80">{error || hint}</p>
      {!modelsReady && camReady && <p className="text-xs text-navy/50">Pehli baar 2–3 sec lag sakte hain, phir instant</p>}
      <button
        type="button"
        disabled={!camReady || !modelsReady || busy || firing.current}
        onClick={() => lastGood.current?.ok && submit(lastGood.current)}
        className="rounded-full bg-teal px-8 py-3 text-white font-semibold shadow-card disabled:opacity-50"
      >
        {busy || firing.current ? "Unlocking…" : !modelsReady ? "Preparing…" : actionLabel}
      </button>
    </div>
  );
}
