"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration, formatKm, splitTrack } from "@/lib/utils";

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
    gm_authFailure?: () => void;
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
  const first = useRef(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const delay = first.current ? 0 : punchOut ? 80 : 1200;
    first.current = false;
    const timer = window.setTimeout(() => {
      (async () => {
        const cfg = await fetch("/api/maps/config").then((r) => r.json());
        if (!cfg.hasKey && !cfg.key) {
          setError("Google Maps key missing. Add GOOGLE_MAPS_API_KEY on the server.");
          return;
        }
        window.gm_authFailure = () => {
          setError("Google Maps key rejected. Enable Maps JavaScript API, billing, and HTTP referrers.");
        };
        const google = await loadGoogle(cfg.key);
        if (!google?.maps) {
          setError("Google Maps script failed to load. Enable Maps JavaScript API.");
          return;
        }
        if (cancelled || !el.current) return;

        const raw = points
          .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
          .map((p) => ({ lat: p.lat, lng: p.lng }));
        const segments = splitTrack(raw, 500).filter((g) => g.length >= 2);
        const last = raw[raw.length - 1] || punchOut || punchIn;
        const center = last || { lat: 30.7333, lng: 76.7794 };

        const map = new google.maps.Map(el.current, {
          center,
          zoom: 18,
          mapTypeId: "roadmap",
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: true,
        });

        const bounds = new google.maps.LatLngBounds();
        for (const path of segments) {
          new google.maps.Polyline({
            map,
            path,
            strokeColor: "#1A73E8",
            strokeOpacity: 0.95,
            strokeWeight: 5,
            geodesic: true,
          });
          path.forEach((p) => bounds.extend(p));
        }
        raw.forEach((p) => {
          bounds.extend(p);
          new google.maps.Circle({
            map,
            center: p,
            radius: 6,
            fillColor: "#1A73E8",
            fillOpacity: 0.85,
            strokeWeight: 0,
          });
        });

        if (punchIn) {
          bounds.extend(punchIn);
          new google.maps.Marker({
            map,
            position: punchIn,
            title: startLabel,
            label: { text: "IN", color: "white", fontSize: "10px" },
          });
        }
        if (punchOut) {
          bounds.extend(punchOut);
          new google.maps.Marker({
            map,
            position: punchOut,
            title: endLabel,
            label: { text: "OUT", color: "white", fontSize: "10px" },
          });
        } else if (last) {
          new google.maps.Marker({
            map,
            position: last,
            title: "Current GPS",
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: "#16a34a",
              fillOpacity: 1,
              strokeColor: "white",
              strokeWeight: 3,
            },
          });
        }

        if (!bounds.isEmpty()) {
          if (raw.length < 2) {
            map.setCenter(center);
            map.setZoom(18);
          } else {
            map.fitBounds(bounds, 56);
          }
        }

        const label = [durationMs != null ? formatDuration(durationMs) : null, distanceMeters != null ? formatKm(distanceMeters) : null]
          .filter(Boolean)
          .join(" · ");
        if (label && last) {
          new google.maps.InfoWindow({
            content: `<div style="font:600 13px system-ui;padding:4px 6px">${label}</div>`,
            position: last,
          }).open(map);
        }
      })().catch((e) => setError(e instanceof Error ? e.message : "Could not load Google Maps."));
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [points.length, punchIn, punchOut, startLabel, endLabel, durationMs, distanceMeters]);

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-3xl">
      <div ref={el} className="h-full min-h-[420px] w-full" />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-white/90 p-6 text-center text-sm text-navy/70">{error}</div>
      )}
    </div>
  );
}
