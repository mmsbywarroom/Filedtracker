"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export function SearchSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQ(value);
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const matches = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = n ? options.filter((o) => o.toLowerCase().includes(n)) : options;
    return list.slice(0, 80);
  }, [options, q]);

  return (
    <div ref={boxRef} className={`relative ${className || ""}`}>
      <input
        value={q}
        onChange={(e) => {
          const next = e.target.value;
          setQ(next);
          onChange(next);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-navy/10 bg-white px-3 text-sm outline-none focus:border-teal"
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-navy/10 bg-white py-1 shadow-card">
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-navy/55 hover:bg-[#f7f9fd]"
            onClick={() => {
              setQ("");
              onChange("");
              setOpen(false);
            }}
          >
            All sectors
          </button>
          {matches.map((o) => (
            <button
              key={o}
              type="button"
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-[#f7f9fd] ${
                o === value ? "font-semibold text-teal" : "text-ink"
              }`}
              onClick={() => {
                setQ(o);
                onChange(o);
                setOpen(false);
              }}
            >
              {o}
            </button>
          ))}
          {!matches.length && <p className="px-3 py-2 text-sm text-navy/45">No matching sector</p>}
        </div>
      )}
    </div>
  );
}
