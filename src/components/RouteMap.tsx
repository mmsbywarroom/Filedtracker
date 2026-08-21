"use client";

import { useEffect, useRef, useState } from "react";
import { formatDuration, formatKm, splitTrack } from "@/lib/utils";

type Point = { lat: number; lng: number; recordedAt?: string };

type Props = {
  points: Point[];
  punchIn?: { lat: number; lng: number };
  punchOut?: { lat: number; lng: number } | null;
  /** Live GPS — where the user is right now */
  liveLocation?: { lat: number; lng: number } | null;
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

function valid(p?: { lat: number; lng: number } | null) {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

export default function RouteMap({
  points,
  punchIn,
  punchOut,
  liveLocation,
  startLabel = "Punch in",
  endLabel = "Punch out",
  durationMs,
  distanceMeters,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const liveMarkerRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  // Init map once
  useEffect(() => {
    let cancelled = false;
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

      const seed =
        (valid(liveLocation) && liveLocation) ||
        (valid(punchOut) && punchOut) ||
        (valid(punchIn) && punchIn) ||
        { lat: 30.7333, lng: 76.7794 };

      mapRef.current = new google.maps.Map(el.current, {
        center: seed,
        zoom: 17,
        mapTypeId: "roadmap",
        streetViewControl: false,
        mapTypeControl: true,
        fullscreenControl: true,
        myLocationControl: false,
      });
      setReady(true);
    })().catch((e) => setError(e instanceof Error ? e.message : "Could not load Google Maps."));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once
  }, []);

  // Draw track / punch markers when path data changes
  useEffect(() => {
    const google = window.google;
    const map = mapRef.current;
    if (!ready || !google?.maps || !map) return;

    for (const o of overlaysRef.current) o.setMap?.(null);
    overlaysRef.current = [];
    infoRef.current?.close?.();
    infoRef.current = null;

    const raw = points
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => ({ lat: p.lat, lng: p.lng }));
    const segments = splitTrack(raw, 500).filter((g) => g.length >= 2);
    const bounds = new google.maps.LatLngBounds();

    for (const path of segments) {
      const line = new google.maps.Polyline({
        map,
        path,
        strokeColor: "#1A73E8",
        strokeOpacity: 0.95,
        strokeWeight: 5,
        geodesic: true,
      });
      overlaysRef.current.push(line);
      path.forEach((p: Point) => bounds.extend(p));
    }

    if (valid(punchIn)) {
      bounds.extend(punchIn!);
      overlaysRef.current.push(
        new google.maps.Marker({
          map,
          position: punchIn,
          title: startLabel,
          label: { text: "IN", color: "white", fontSize: "10px" },
        })
      );
    }
    if (valid(punchOut)) {
      bounds.extend(punchOut!);
      overlaysRef.current.push(
        new google.maps.Marker({
          map,
          position: punchOut,
          title: endLabel,
          label: { text: "OUT", color: "white", fontSize: "10px" },
        })
      );
    }

    const followLive = valid(liveLocation);
    if (!followLive && !bounds.isEmpty()) {
      if (raw.length < 2 && valid(punchIn) && !valid(punchOut)) {
        map.setCenter(punchIn);
        map.setZoom(17);
      } else if (raw.length < 2 && valid(punchOut)) {
        map.setCenter(punchOut);
        map.setZoom(17);
      } else {
        map.fitBounds(bounds, 56);
      }
    }

    const label = [durationMs != null ? formatDuration(durationMs) : null, distanceMeters != null ? formatKm(distanceMeters) : null]
      .filter(Boolean)
      .join(" · ");
    const infoAt = (valid(liveLocation) && liveLocation) || raw[raw.length - 1] || punchOut || punchIn;
    if (label && valid(infoAt)) {
      infoRef.current = new google.maps.InfoWindow({
        content: `<div style="font:600 13px system-ui;padding:4px 6px">${label}</div>`,
        position: infoAt,
      });
      infoRef.current.open(map);
    }
  }, [ready, points, punchIn?.lat, punchIn?.lng, punchOut?.lat, punchOut?.lng, startLabel, endLabel, durationMs, distanceMeters]);

  // Live "you are here" marker — update without redrawing the whole track
  useEffect(() => {
    const google = window.google;
    const map = mapRef.current;
    if (!ready || !google?.maps || !map) return;

    if (!valid(liveLocation)) {
      liveMarkerRef.current?.setMap?.(null);
      liveMarkerRef.current?.__halo?.setMap?.(null);
      liveMarkerRef.current = null;
      return;
    }

    if (!liveMarkerRef.current) {
      liveMarkerRef.current = new google.maps.Marker({
        map,
        position: liveLocation,
        title: "You are here",
        zIndex: 999,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 11,
          fillColor: "#2563eb",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });
      liveMarkerRef.current.__halo = new google.maps.Circle({
        map,
        center: liveLocation,
        radius: 28,
        fillColor: "#2563eb",
        fillOpacity: 0.15,
        strokeColor: "#2563eb",
        strokeOpacity: 0.35,
        strokeWeight: 1,
      });
    } else {
      liveMarkerRef.current.setPosition(liveLocation);
      liveMarkerRef.current.__halo?.setCenter(liveLocation);
    }

    // Keep map on the user when there is little/no track yet
    if (!points.length || points.length < 3) {
      map.panTo(liveLocation!);
      if ((map.getZoom?.() ?? 0) < 16) map.setZoom(17);
    }
  }, [ready, liveLocation?.lat, liveLocation?.lng, points.length]);

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-3xl">
      <div ref={el} className="h-full min-h-[420px] w-full" />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-white/90 p-6 text-center text-sm text-navy/70">{error}</div>
      )}
      {!error && !liveLocation && !points.length && !punchIn && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-navy/60 shadow">
            Finding you…
          </span>
        </div>
      )}
    </div>
  );
}
