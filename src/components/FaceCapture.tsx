"use client";

import { useEffect, useRef, useState } from "react";
import { getFaceDescriptor, loadFaceModels } from "@/lib/face";

type Props = {
  actionLabel: string;
  onCapture: (descriptor: number[]) => Promise<void> | void;
  busy?: boolean;
};

export function FaceCapture({ actionLabel, onCapture, busy }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("Align your face in the circle");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        await loadFaceModels();
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
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

  async function capture() {
    if (!videoRef.current) return;
    setHint("Scanning face…");
    const desc = await getFaceDescriptor(videoRef.current);
    if (!desc) {
      setHint("No face found. Come closer and try again.");
      return;
    }
    await onCapture(desc);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-64 w-64 overflow-hidden rounded-full border-4 border-white shadow-float ring-4 ring-teal-bright/40">
        <video ref={videoRef} className="h-full w-full object-cover scale-x-[-1]" playsInline muted />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-navy/80 text-white text-sm">
            Starting camera…
          </div>
        )}
      </div>
      <p className="text-sm text-navy/70">{error || hint}</p>
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
