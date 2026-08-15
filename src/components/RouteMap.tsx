"use client";

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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

const startIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;background:#1a73e8;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.3)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const endIcon = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;background:#ea4335;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,.3)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

function Fit({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!pts.length) return;
    if (pts.length === 1) map.setView(pts[0], 15);
    else map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] });
  }, [map, pts]);
  return null;
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
  const coords = useMemo(() => {
    const list: [number, number][] = points.map((p) => [p.lat, p.lng]);
    if (punchIn) list.unshift([punchIn.lat, punchIn.lng]);
    if (punchOut) list.push([punchOut.lat, punchOut.lng]);
    return list;
  }, [points, punchIn, punchOut]);

  const center = coords[0] || [28.4595, 77.0266];
  const mid = coords[Math.floor(coords.length / 2)] || center;
  const label = [durationMs != null ? formatDuration(durationMs) : null, distanceMeters != null ? formatKm(distanceMeters) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="relative h-full min-h-[420px] w-full overflow-hidden rounded-3xl">
      <MapContainer center={center} zoom={14} className="h-full w-full" zoomControl={false}>
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        {coords.length > 1 && (
          <>
            <Polyline positions={coords} pathOptions={{ color: "#8ab4f8", weight: 12, opacity: 0.45, lineCap: "round", lineJoin: "round" }} />
            <Polyline positions={coords} pathOptions={{ color: "#1a73e8", weight: 7, opacity: 1, lineCap: "round", lineJoin: "round" }} />
          </>
        )}
        {punchIn && (
          <Marker position={[punchIn.lat, punchIn.lng]} icon={startIcon}>
            <Popup>{startLabel}</Popup>
          </Marker>
        )}
        {punchOut && (
          <Marker position={[punchOut.lat, punchOut.lng]} icon={endIcon}>
            <Popup>{endLabel}</Popup>
          </Marker>
        )}
        {label && coords.length > 1 && (
          <Marker
            position={mid}
            icon={L.divIcon({
              className: "",
              html: `<div style="background:#174ea6;color:white;padding:6px 12px;border-radius:16px;font:600 12px/1.2 system-ui;white-space:nowrap;box-shadow:0 4px 14px rgba(23,78,166,.35)">${label}</div>`,
              iconSize: [120, 28],
              iconAnchor: [60, 40],
            })}
          />
        )}
        <Fit pts={coords} />
      </MapContainer>
    </div>
  );
}
