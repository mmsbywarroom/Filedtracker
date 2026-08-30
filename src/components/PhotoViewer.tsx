"use client";

import { useEffect, useState } from "react";

export function PhotoViewer({
  src,
  title,
  onClose,
}: {
  src: string;
  title?: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)));
      if (e.key === "-") setZoom((z) => Math.max(0.4, +(z - 0.25).toFixed(2)));
      if (e.key === "r" || e.key === "R") setRotate((r) => (r + 90) % 360);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/80 p-3 md:p-6" role="dialog" aria-modal="true">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-white">
        <p className="truncate text-sm font-semibold">{title || "Photo"}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.25).toFixed(2)))}>
            Zoom out
          </button>
          <span className="min-w-[3.5rem] text-center text-sm">{Math.round(zoom * 100)}%</span>
          <button type="button" className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}>
            Zoom in
          </button>
          <button type="button" className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25" onClick={() => { setZoom(1); setRotate(0); }}>
            Reset
          </button>
          <button type="button" className="rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25" onClick={() => setRotate((r) => (r + 90) % 360)}>
            Rotate
          </button>
          <button type="button" className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-ink" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl bg-black/40"
        onWheel={(e) => {
          e.preventDefault();
          setZoom((z) => Math.min(4, Math.max(0.4, +(z + (e.deltaY < 0 ? 0.15 : -0.15)).toFixed(2))));
        }}
        onClick={onClose}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          onClick={(e) => e.stopPropagation()}
          className="max-h-none max-w-none origin-center select-none"
          style={{ transform: `rotate(${rotate}deg) scale(${zoom})`, transition: "transform 0.15s ease" }}
        />
      </div>
    </div>
  );
}
