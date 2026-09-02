"use client";

import { useEffect, useRef, useState } from "react";

export type LiveMapUser = {
  userId: string;
  name: string;
  phone: string;
  designation: string;
  assemblyName: string;
  isLive: boolean;
  lat: number;
  lng: number;
  recordedAt: string;
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

type Props = {
  users: LiveMapUser[];
  selectedUserId?: string | null;
  onSelectUser?: (userId: string | null) => void;
  height?: number;
};

export default function AdminUsersMap({ users, selectedUserId, onSelectUser, height = 420 }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await fetch("/api/maps/config").then((r) => r.json());
      if (!cfg.hasKey && !cfg.key) {
        setError("Google Maps key missing. Add GOOGLE_MAPS_API_KEY on the server.");
        return;
      }
      window.gm_authFailure = () => {
        setError("Google Maps key rejected.");
      };
      const google = await loadGoogle(cfg.key);
      if (cancelled || !el.current || !google?.maps) return;

      mapRef.current = new google.maps.Map(el.current, {
        center: { lat: 31.1471, lng: 75.3412 },
        zoom: 8,
        mapTypeId: "roadmap",
        streetViewControl: false,
        fullscreenControl: true,
      });
      setReady(true);
    })().catch((e) => setError(e instanceof Error ? e.message : "Could not load map."));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const google = window.google;
    const map = mapRef.current;
    if (!ready || !google?.maps || !map) return;

    for (const m of markersRef.current) m.setMap?.(null);
    markersRef.current = [];
    infoRef.current?.close?.();
    infoRef.current = null;

    if (!users.length) {
      map.setCenter({ lat: 31.1471, lng: 75.3412 });
      map.setZoom(8);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    for (const u of users) {
      if (!Number.isFinite(u.lat) || !Number.isFinite(u.lng)) continue;
      const pos = { lat: u.lat, lng: u.lng };
      bounds.extend(pos);
      const marker = new google.maps.Marker({
        map,
        position: pos,
        title: u.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: u.userId === selectedUserId ? 12 : 9,
          fillColor: u.isLive ? "#059669" : "#64748b",
          fillOpacity: 1,
          strokeColor: u.userId === selectedUserId ? "#1e293b" : "#ffffff",
          strokeWeight: u.userId === selectedUserId ? 3 : 2,
        },
      });
      marker.addListener("click", () => {
        onSelectUser?.(u.userId);
        const when = new Date(u.recordedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        infoRef.current?.close?.();
        infoRef.current = new google.maps.InfoWindow({
          content: `<div style="font:600 13px system-ui;padding:2px 4px;max-width:220px">
            <div>${u.name}</div>
            <div style="font-weight:400;font-size:11px;color:#445;margin-top:4px">${u.phone}</div>
            <div style="font-weight:400;font-size:11px;color:#445">${u.designation} · ${u.assemblyName}</div>
            <div style="font-weight:400;font-size:11px;color:#445;margin-top:4px">${u.isLive ? "Live now" : "Last known"} · ${when}</div>
            <div style="font-weight:400;font-size:10px;color:#667;margin-top:2px">${u.lat.toFixed(5)}, ${u.lng.toFixed(5)}</div>
          </div>`,
          position: pos,
        });
        infoRef.current.open(map, marker);
      });
      markersRef.current.push(marker);
    }

    if (!bounds.isEmpty()) {
      if (users.length === 1) {
        map.setCenter(bounds.getCenter());
        map.setZoom(15);
      } else {
        map.fitBounds(bounds, 48);
      }
    }
  }, [ready, users, selectedUserId, onSelectUser]);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-navy/10 bg-white" style={{ height }}>
      <div ref={el} className="absolute inset-0 h-full w-full" />
      {error && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-white/90 p-6 text-center text-sm text-navy/70">
          {error}
        </div>
      )}
      {!error && !users.length && (
        <div className="absolute inset-0 z-10 grid place-items-center text-sm text-navy/50">No locations for this date / filter.</div>
      )}
    </div>
  );
}
