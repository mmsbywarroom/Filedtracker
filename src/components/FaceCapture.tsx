"use client";

import { useEffect, useRef, useState } from "react";
import { averageDescriptors, loadFaceModels, scanFace, type FaceScan, type FaceScanError } from "@/lib/face";
import { isIosBrowser } from "@/lib/deviceGeo";
import { useLang } from "@/lib/i18n";
import { jpegQuality, jpegSize } from "@/lib/network";

type Props = {
  actionLabel: string;
  onCapture: (descriptor: number[], image: string, samples?: number[][]) => Promise<void> | void;
  busy?: boolean;
  /** Registration needs a few solid frames; verify can be quicker */
  mode?: "register" | "verify";
};

function snapshot(video: HTMLVideoElement, box?: { x: number; y: number; width: number; height: number }) {
  const size = jpegSize();
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  if (box) {
    const pad = 0.2;
    const x = Math.max(0, box.x - box.width * pad);
    const y = Math.max(0, box.y - box.height * pad);
    const w = Math.min(video.videoWidth - x, box.width * (1 + pad * 2));
    const h = Math.min(video.videoHeight - y, box.height * (1 + pad * 2));
    ctx.drawImage(video, x, y, w, h, 0, 0, size, size);
  } else {
    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - side) / 2;
    const sy = (video.videoHeight - side) / 2;
    ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
  }
  return canvas.toDataURL("image/jpeg", jpegQuality());
}

function waitVideoReady(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    if (video.videoWidth > 0 && video.readyState >= 2) {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => reject(new Error("Camera slow to start. Close other apps and try again.")), 8000);
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", done);
      video.removeEventListener("loadeddata", done);
      resolve();
    };
    video.addEventListener("loadedmetadata", done);
    video.addEventListener("loadeddata", done);
  });
}

export function FaceCapture({ actionLabel, onCapture, busy, mode = "verify" }: Props) {
  const { t } = useLang();
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastGood = useRef<FaceScan | null>(null);
  const samples = useRef<number[][]>([]);
  const firing = useRef(false);
  const hits = useRef(0);
  const [camReady, setCamReady] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const needHits = mode === "register" ? 6 : 1;

  function hintForError(err: FaceScanError) {
    if (err === "too_far") return t("tooFar");
    if (err === "multiple") return t("multiple");
    if (err === "partial") return t("partialFace");
    if (err === "off_center") return t("offCenterFace");
    if (err === "low_quality") return t("lowQualityFace");
    return t("noFace");
  }

  useEffect(() => {
    setHint(t("camStarting"));
  }, [t]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        const ios = isIosBrowser();
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: ios ? 480 : 640 },
            height: { ideal: ios ? 480 : 640 },
          },
          audio: false,
        });
        if (cancelled || !videoRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.setAttribute("webkit-playsinline", "true");
        await videoRef.current.play();
        await waitVideoReady(videoRef.current);
        setCamReady(true);
        setError("");
        setHint(t("preparing"));
      } catch (e) {
        setError(e instanceof Error ? e.message : t("camAllow"));
        return;
      }
      try {
        await loadFaceModels();
        if (cancelled) return;
        setModelsReady(true);
        setHint(mode === "register" ? t("lookCamera") : t("lookCamera"));
      } catch {
        if (!cancelled) setHint(t("retryLook"));
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [mode]);

  async function submit(result: FaceScan) {
    if (!result.ok || !videoRef.current || firing.current || busy) return;
    firing.current = true;
    setLocked(true);
    setHint(t("faceLocked"));
    const image = snapshot(videoRef.current, result.box);
    const collected = samples.current.length ? [...samples.current] : [result.descriptor];
    const averaged = averageDescriptors(collected);
    try {
      await onCapture(averaged.length ? averaged : result.descriptor, image, collected);
    } catch (e) {
      hits.current = 0;
      samples.current = [];
      setHint(e instanceof Error ? e.message : t("retryLook"));
    } finally {
      firing.current = false;
      setLocked(false);
    }
  }

  useEffect(() => {
    if (!camReady || !modelsReady || busy || firing.current) return;
    let running = false;
    let timer = 0;
    const tick = async () => {
      if (running || !videoRef.current || firing.current) return;
      running = true;
      const result = await scanFace(videoRef.current, { strict: mode === "register" });
      if (result.ok) {
        lastGood.current = result;
        hits.current += 1;
        if (samples.current.length < 6) samples.current.push(result.descriptor);
        if (mode === "register") {
          setHint(`${t("faceFound")} (${Math.min(hits.current, needHits)}/${needHits})`);
        } else {
          setHint(t("faceFound"));
        }
        if (hits.current >= needHits) await submit(result);
      } else {
        hits.current = 0;
        lastGood.current = null;
        if (samples.current.length > 2) samples.current = samples.current.slice(-2);
        setHint(hintForError(result.error));
      }
      running = false;
    };
    timer = window.setInterval(tick, isIosBrowser() ? 400 : 320);
    tick();
    return () => clearInterval(timer);
  }, [camReady, modelsReady, busy, mode, needHits, t]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className={`relative aspect-square w-full max-w-xs overflow-hidden rounded-full border-[5px] bg-black shadow-float ${
          locked ? "border-emerald-400 ring-4 ring-emerald-300/50" : "border-white ring-4 ring-teal/30"
        }`}
      >
        <video ref={videoRef} className="h-full w-full object-cover scale-x-[-1]" playsInline muted autoPlay />
        {!camReady && (
          <div className="absolute inset-0 grid place-items-center bg-navy/80 text-sm text-white">{t("camStarting")}</div>
        )}
      </div>
      <p className="text-center text-sm font-medium text-navy/80">{error || hint}</p>
      {!modelsReady && camReady && <p className="text-xs text-navy/50">{t("firstLoad")}</p>}
      {mode === "register" && (
        <p className="max-w-xs text-center text-xs text-navy/50">
          Center your full face in the round frame — forehead, both eyes, nose and chin clearly visible. Use bright light.
        </p>
      )}
      <button
        type="button"
        disabled={!camReady || !modelsReady || busy || firing.current}
        onClick={() => lastGood.current?.ok && submit(lastGood.current)}
        className="rounded-full bg-teal px-8 py-3 font-semibold text-white shadow-card disabled:opacity-50 touch-manipulation"
      >
        {busy || firing.current ? t("unlocking") : !modelsReady ? t("preparing") : actionLabel}
      </button>
    </div>
  );
}
