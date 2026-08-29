"use client";

import { useState } from "react";

export function FacePhoto({ src, label }: { src?: string | null; label: string }) {
  const [open, setOpen] = useState(false);
  if (!src) {
    const letter = (label || "?").trim().charAt(0).toUpperCase();
    return (
      <span
        title={label}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-navy/10 bg-[#e8eef8] text-sm font-semibold text-navy/50"
      >
        {letter}
      </span>
    );
  }
  return (
    <>
      <button type="button" title={label} onClick={() => setOpen(true)} className="inline-block shrink-0">
        <img
          src={src}
          alt={label}
          className="h-11 w-11 rounded-lg border border-navy/10 object-cover shadow-sm"
        />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[90vh] max-w-lg rounded-2xl border border-navy/10 bg-white p-4 shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-sm font-semibold text-ink">{label}</p>
            <img src={src} alt={label} className="max-h-[70vh] w-full rounded-xl object-contain" />
            <button type="button" onClick={() => setOpen(false)} className="admin-btn-ink mt-3 w-full">
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
