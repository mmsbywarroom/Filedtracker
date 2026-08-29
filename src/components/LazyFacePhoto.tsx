"use client";

import { useState } from "react";

type Kind = "registered" | "in" | "out";

/** Placeholder until click — then fetches face so daily records stay fast. */
export function LazyFacePhoto({
  attendanceId,
  kind,
  label,
  available,
}: {
  attendanceId: string;
  kind: Kind;
  label: string;
  available?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const letter = (label || "?").trim().charAt(0).toUpperCase();
  const canLoad = available !== false && Boolean(attendanceId);

  async function loadAndOpen() {
    if (!canLoad) return;
    setOpen(true);
    if (src) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/admin/attendance/${attendanceId}/faces?kind=${kind}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.image) {
        setErr(data.error || "No photo");
        return;
      }
      setSrc(data.image);
    } catch {
      setErr("Could not load photo");
    } finally {
      setBusy(false);
    }
  }

  if (!canLoad) {
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
      <button type="button" title={`${label} — tap to view`} onClick={loadAndOpen} className="inline-block shrink-0">
        <span className="grid h-11 w-11 place-items-center rounded-lg border border-teal/30 bg-teal/10 text-[10px] font-bold uppercase tracking-wide text-teal shadow-sm">
          View
        </span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[90vh] max-w-lg rounded-2xl border border-navy/10 bg-white p-4 shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 text-sm font-semibold text-ink">{label}</p>
            {busy && <p className="py-10 text-center text-sm text-navy/50">Loading…</p>}
            {err && !busy && <p className="py-10 text-center text-sm text-red-600">{err}</p>}
            {src && !busy && <img src={src} alt={label} className="max-h-[70vh] w-full rounded-xl object-contain" />}
            <button type="button" onClick={() => setOpen(false)} className="admin-btn-ink mt-3 w-full">
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
