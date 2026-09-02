"use client";

import { useEffect, useState } from "react";
import RouteMap from "@/components/RouteMapDynamic";
import { apiFetch } from "@/lib/clientHeaders";

type OpenSession = {
  punchInLat: number;
  punchInLng: number;
  points: { lat: number; lng: number; recordedAt?: string }[];
};

export default function NativeMapPage() {
  const [open, setOpen] = useState<OpenSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch("/api/attendance", { cache: "no-store" });
        const data = await res.json();
        setOpen(data.open || null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <main className="min-h-screen bg-sand p-4 text-sm text-navy/60">Loading map…</main>;
  }

  if (!open) {
    return (
      <main className="min-h-screen bg-sand p-4 text-sm text-navy/70">
        No active punch-in session. Punch in first to see your live route.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-sand">
      <div className="h-[100dvh]">
        <RouteMap points={open.points} punchIn={{ lat: open.punchInLat, lng: open.punchInLng }} />
      </div>
    </main>
  );
}
