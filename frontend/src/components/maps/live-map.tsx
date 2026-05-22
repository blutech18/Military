"use client";

import { MapContainer, TileLayer, Marker, Popup, Circle, ZoomControl, useMap } from "react-leaflet";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { api } from "@/lib/api";
import { fmtRelative } from "@/lib/utils";

// Fix default Leaflet icon paths under bundlers like Webpack / Turbopack
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const tactical = L.divIcon({
  className: "armory-marker",
  html: `<div class="relative">
    <div class="absolute inset-0 rounded-full bg-olive-400/40 animate-ping"></div>
    <div class="relative h-3 w-3 rounded-full bg-olive-300 ring-2 ring-olive-700 shadow-[0_0_10px_rgba(174,183,113,0.9)]"></div>
  </div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const overdueMarker = L.divIcon({
  className: "armory-marker overdue",
  html: `<div class="h-3 w-3 rounded-full bg-red-400 ring-2 ring-red-800 shadow-[0_0_10px_rgba(239,68,68,0.9)]"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const staleMarker = L.divIcon({
  className: "armory-marker stale",
  html: `<div class="relative">
    <div class="absolute -inset-1 rounded-full border border-amber-400/60"></div>
    <div class="relative h-3 w-3 rounded-full bg-amber-300 ring-2 ring-amber-800 shadow-[0_0_10px_rgba(245,158,11,0.8)]"></div>
  </div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const placeholderMarker = L.divIcon({
  className: "armory-marker placeholder",
  html: `<div class="relative">
    <div class="absolute -inset-1 rounded-full border border-dashed border-slate-300/70"></div>
    <div class="relative h-3 w-3 rounded-full bg-slate-300 ring-2 ring-slate-700"></div>
  </div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

interface LiveItem {
  equipment_id: number;
  serial_number: string;
  model: string;
  status: string;
  condition: string;
  assigned_to?: string | null;
  expected_return?: string | null;
  lat: number;
  lon: number;
  captured_at?: string | null;
  received_at?: string | null;
  inside_geofence?: boolean;
  battery_pct?: number | null;
  device_id?: string | null;
  iot_online: boolean;
  telemetry_source: "iot" | "stale" | "placeholder" | "missing";
  is_placeholder: boolean;
  is_stale: boolean;
  location_note: string;
}

interface Geofence {
  location_id: number;
  location_name: string;
  center_latitude: number;
  center_longitude: number;
  radius_meters: number;
  security_level: number;
  is_armory: boolean;
}

interface LiveResponse {
  items: LiveItem[];
  geofences: Geofence[];
  poll_interval: number;
  online_window_sec: number;
  updated_at: string;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    map.fitBounds(L.latLngBounds(points.map(p => L.latLng(p[0], p[1]))).pad(0.4));
  }, [points, map]);
  return null;
}

export function LiveMap() {
  const interval = Number(process.env.NEXT_PUBLIC_GPS_POLL_SECONDS ?? 30) * 1000;
  const lat = Number(process.env.NEXT_PUBLIC_DEFAULT_MAP_CENTER_LAT ?? 8.484460);
  const lon = Number(process.env.NEXT_PUBLIC_DEFAULT_MAP_CENTER_LON ?? 124.657010);

  const { data } = useQuery({
    queryKey: ["gps-live"],
    queryFn: async () => (await api.get<LiveResponse>("/gps/live")).data,
    refetchInterval: interval,
  });

  const points = useMemo<[number, number][]>(
    () => data?.items.map(i => [Number(i.lat), Number(i.lon)] as [number, number]) ?? [],
    [data]
  );
  const placeholderCount = data?.items.filter((i) => i.is_placeholder).length ?? 0;
  const staleCount = data?.items.filter((i) => i.is_stale).length ?? 0;
  const liveCount = data?.items.filter((i) => i.telemetry_source === "iot").length ?? 0;

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[lat, lon]}
        zoom={15}
        zoomControl={false}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/">OSM</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <ZoomControl position="topright" />

        {data?.geofences.map((g) => (
          <Circle
            key={g.location_id}
            center={[Number(g.center_latitude), Number(g.center_longitude)]}
            radius={Number(g.radius_meters)}
            pathOptions={{
              color: g.is_armory ? "#aeb771" : g.security_level === 2 ? "#f59e0b" : "#60a5fa",
              weight: 1.4,
              fillOpacity: 0.05,
              dashArray: "4 6",
            }}
          >
            <Popup>
              <strong>{g.location_name}</strong>
              <br /><span style={{ fontSize: 11 }}>{g.security_level === 2 ? "RESTRICTED" : "STANDARD"} · {g.radius_meters}m</span>
            </Popup>
          </Circle>
        ))}

        {data?.items.map((item) => (
          <Marker
            key={item.equipment_id}
            position={[Number(item.lat), Number(item.lon)]}
            icon={markerFor(item)}
          >
            <Popup>
              <div style={{ minWidth: 190 }}>
                <strong>{item.model}</strong>
                <br /><span style={{ fontSize: 11 }}>SN {item.serial_number}</span>
                <br />Status: <em>{item.status}</em>
                <br />Condition: {item.condition}
                {item.assigned_to && <><br />Issued to: {item.assigned_to}</>}
                {item.device_id && <><br />Device: {item.device_id}</>}
                {item.battery_pct != null && <><br />Battery: {item.battery_pct}%</>}
                <br />Telemetry: <strong>{telemetryLabel(item.telemetry_source)}</strong>
                <br /><span style={{ fontSize: 11, color: "#aaa" }}>{item.location_note}</span>
                {item.captured_at && <><br /><span style={{ fontSize: 11, color: "#aaa" }}>Captured {fmtRelative(item.captured_at)}</span></>}
                {item.received_at && <><br /><span style={{ fontSize: 11, color: "#aaa" }}>Received {fmtRelative(item.received_at)}</span></>}
              </div>
            </Popup>
          </Marker>
        ))}

        <FitBounds points={points} />
      </MapContainer>

      {data && data.items.length > 0 && (
        <div className="pointer-events-none absolute left-3 top-3 z-[500] flex flex-wrap gap-1.5">
          <span className="pill pill-ok bg-steel-900/85">{liveCount} live</span>
          {staleCount > 0 && <span className="pill pill-warn bg-steel-900/85">{staleCount} last known</span>}
          {placeholderCount > 0 && <span className="pill pill-muted bg-steel-900/85">{placeholderCount} placeholder</span>}
        </div>
      )}
    </div>
  );
}

function markerFor(item: LiveItem) {
  if (item.telemetry_source === "placeholder") return placeholderMarker;
  if (item.telemetry_source === "stale") return staleMarker;
  if (item.status === "Overdue") return overdueMarker;
  return tactical;
}

function telemetryLabel(source: LiveItem["telemetry_source"]): string {
  if (source === "iot") return "Live IoT";
  if (source === "stale") return "Last known";
  if (source === "placeholder") return "Placeholder";
  return "Missing";
}
