"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration, formatKm } from "@/lib/utils";

type Point = { lat: number; lng: number; recordedAt?: string };

type Props = {
  points: Point[];
  punchIn?: { lat: number; lng: number };
  punchOut?: { lat: number; lng: number } | null;
  startLabel?: string;
  endLabel?: string;
  durationMs?: number;
  distanceMeters?: number;
};

declare global {
  interface Window {
    google?: any;
    __ftGoogleMapsPromise?: Promise<any>;
  }
}

function loadGoogle(key: string) {
  if (window.google?.maps) return Promise.resolve(window.google);
  if (window.__ftGoogleMapsPromise) return window.__ftGoogleMapsPromise;
  window.__ftGoogleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });
  return window.__ftGoogleMapsPromise;
}

export default function RouteMap({
  points,
  punchIn,
  punchOut,
  startLabel = "Punch in",
  endLabel = "Punch out",
  durationMs,
  distanceMeters,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await fetch("/api/maps/config").then((r) => r.json());
      if (!cfg.key) {
        setError("Google Maps key missing. Add GOOGLE_MAPS_API_KEY on the server.");
        return;
      }
      const google = await loadGoogle(cfg.key);
      if (cancelled || !el.current) return;

      const raw = [
        ...(punchIn ? [punchIn] : []),
        ...points,
        ...(punchOut ? [punchOut] : []),
      ].map((p) => ({ lat: p.lat, lng: p.lng }));

      let path = raw;
      if (raw.length > 1) {
        const snapped = await fetch("/api/maps/snap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ points: raw }),
        }).then((r) => r.json());
        if (Array.isArray(snapped.points) && snapped.points.length > 1) path = snapped.points;
      }

      const center = path[0] || { lat: 30.7333, lng: 76.7794 };

      const map = new google.maps.Map(el.current, {
        center,
        zoom: 15,
        mapTypeId: "roadmap",
        streetViewControl: false,
        mapTypeControl: true,
        fullscreenControl: true,
      });

      if (path.length > 1) {
        new google.maps.Polyline({
          map,
          path,
          strokeColor: "#1A56C4",
          strokeOpacity: 1,
          strokeWeight: 6,
        });
      }

      if (punchIn) {
        new google.maps.Marker({
          map,
          position: punchIn,
          title: startLabel,
          label: { text: "IN", color: "white", fontSize: "10px" },
        });
      }
      if (punchOut) {
        new google.maps.Marker({
          map,
          position: punchOut,
          title: endLabel,
          label: { text: "OUT", color: "white", fontSize: "10px" },
        });
      }

      const bounds = new google.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      if (path.length) map.fitBounds(bounds, 48);

      const label = [durationMs != null ? formatDuration(durationMs) : null, distanceMeters != null ? formatKm(distanceMeters) : null]
        .filter(Boolean)
        .join(" · ");
      if (label && path.length) {
        new google.maps.InfoWindow({
          content: `<div style="font:600 13px system-ui;padding:4px 6px">${label}</div>`,
          position: path[Math.floor(path.length / 2)],
        }).open(map);
      }
    })().catch(() => setError("Could not load Google Maps."));
    return () => {
      cancelled = true;
    };
  }, [points, punchIn, punchOut, startLabel, endLabel, durationMs, distanceMeters]);

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-3xl">
      <div ref={el} className="h-full min-h-[420px] w-full" />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-white/90 p-6 text-center text-sm text-navy/70">{error}</div>
      )}
    </div>
  );
}
