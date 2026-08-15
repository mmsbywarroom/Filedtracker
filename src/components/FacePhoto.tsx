"use client";

export function FacePhoto({ src, label }: { src?: string | null; label: string }) {
  if (!src) {
    const letter = (label || "?").trim().charAt(0).toUpperCase();
    return (
      <span title={label} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#e8eef8] text-sm font-semibold text-navy/50 ring-2 ring-navy/10">
        {letter}
      </span>
    );
  }
  return (
    <a href={src} target="_blank" rel="noreferrer" title={label} className="inline-block shrink-0">
      <img src={src} alt={label} className="h-12 w-12 rounded-full object-cover ring-2 ring-navy/10" />
    </a>
  );
}
