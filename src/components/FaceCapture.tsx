"use client";

import { useEffect, useRef, useState } from "react";
import { loadFaceModels, scanFace, type FaceScan } from "@/lib/face";

type Props = {
  actionLabel: string;
  onCapture: (descriptor: number[], image: string) => Promise<void> | void;
  busy?: boolean;
};

const hints = {
  no_face: "Face nahi dikh raha. Camera ke saamne ruko, light theek rakho.",
  too_far: "Bahut door ho. Ek kadam aage aao — background wala chehra nahi chalega.",
  multiple: "Frame mein ek hi chehra hona chahiye.",
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
  return canvas.toDataURL("image/jpeg", 0.72);
}

export function FaceCapture({ actionLabel, onCapture, busy }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastGood = useRef<FaceScan | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("Camera ke saamne natural distance pe ruko");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        await loadFaceModels();
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);
      } catch {
        setError("Camera permission is required for face punch.");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!ready || busy) return;
    let timer = 0;
    let running = false;
    const tick = async () => {
      if (running || !videoRef.current) return;
      running = true;
      const result = await scanFace(videoRef.current);
      lastGood.current = result.ok ? result : null;
      if (result.ok) setHint("Face ready — Confirm dabao");
      else setHint(hints[result.error]);
      running = false;
    };
    timer = window.setInterval(tick, 280);
    tick();
    return () => clearInterval(timer);
  }, [ready, busy]);

  async function capture() {
    if (!videoRef.current) return;
    setHint("Scanning face…");
    let result = lastGood.current?.ok ? lastGood.current : await scanFace(videoRef.current);
    if (!result.ok) {
      setHint(hints[result.error]);
      return;
    }
    const image = snapshot(videoRef.current, result.box);
    await onCapture(result.descriptor, image);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative aspect-[3/4] w-full max-w-xs overflow-hidden rounded-[1.75rem] border-4 border-white shadow-float ring-4 ring-teal/30">
        <video ref={videoRef} className="h-full w-full object-cover scale-x-[-1]" playsInline muted />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-navy/80 text-white text-sm">
            Starting camera…
          </div>
        )}
      </div>
      <p className="text-center text-sm text-navy/70">{error || hint}</p>
      <button
        type="button"
        disabled={!ready || busy}
        onClick={capture}
        className="rounded-full bg-teal px-8 py-3 text-white font-semibold shadow-card disabled:opacity-50"
      >
        {busy ? "Please wait…" : actionLabel}
      </button>
    </div>
  );
}
