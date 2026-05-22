"use client";

import { MapContainer, TileLayer, Polyline, Marker, Popup, ZoomControl, Circle, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import { fmtRelative } from "@/lib/utils";

// Fix default Leaflet icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const startIcon = L.divIcon({
  className: "armory-marker",
  html: `<div class="h-3.5 w-3.5 rounded-full bg-emerald-400 ring-2 ring-emerald-800 shadow-[0_0_10px_rgba(52,211,153,0.9)]"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const endIcon = L.divIcon({
  className: "armory-marker",
  html: `<div class="h-3.5 w-3.5 rounded-full bg-red-400 ring-2 ring-red-800 shadow-[0_0_10px_rgba(239,68,68,0.9)]"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

interface GpsPoint {
  gps_log_id: number;
  captured_at: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  speed_mps: number | null;
  is_inside_geofence: boolean;
}

interface Geofence {
  location_id: number;
  location_name: string;
  center_latitude: number;
  center_longitude: number;
  radius_meters: number;
  is_armory: boolean;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 2) return;
    map.fitBounds(L.latLngBounds(points.map(p => L.latLng(p[0], p[1]))).pad(0.2));
  }, [points, map]);
  return null;
}

interface Props {
  history: GpsPoint[];
  geofences?: Geofence[];
}

export function RouteHistoryMap({ history, geofences = [] }: Props) {
  const lat = Number(process.env.NEXT_PUBLIC_DEFAULT_MAP_CENTER_LAT ?? 8.484460);
  const lon = Number(process.env.NEXT_PUBLIC_DEFAULT_MAP_CENTER_LON ?? 124.657010);

  const positions = useMemo<[number, number][]>(
    () => history.map(p => [Number(p.latitude), Number(p.longitude)]),
    [history]
  );

  const first = history.length > 0 ? history[history.length - 1] : null; // oldest
  const last = history.length > 0 ? history[0] : null; // newest (sorted desc)

  return (
    <MapContainer
      center={positions.length > 0 ? positions[0] : [lat, lon]}
      zoom={15}
      zoomControl={false}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <ZoomControl position="topright" />

      {geofences.map((g) => (
        <Circle
          key={g.location_id}
          center={[Number(g.center_latitude), Number(g.center_longitude)]}
          radius={Number(g.radius_meters)}
          pathOptions={{ color: g.is_armory ? "#aeb771" : "#60a5fa", weight: 1.2, fillOpacity: 0.04, dashArray: "4 6" }}
        >
          <Popup><strong>{g.location_name}</strong></Popup>
        </Circle>
      ))}

      {positions.length > 1 && (
        <Polyline
          positions={positions}
          pathOptions={{ color: "#aeb771", weight: 2.5, opacity: 0.8 }}
        />
      )}

      {first && (
        <Marker position={[Number(first.latitude), Number(first.longitude)]} icon={startIcon}>
          <Popup>
            <strong>Start</strong><br />
            <span style={{ fontSize: 11 }}>{fmtRelative(first.captured_at)}</span>
          </Popup>
        </Marker>
      )}

      {last && last !== first && (
        <Marker position={[Number(last.latitude), Number(last.longitude)]} icon={endIcon}>
          <Popup>
            <strong>Latest</strong><br />
            <span style={{ fontSize: 11 }}>{fmtRelative(last.captured_at)}</span>
          </Popup>
        </Marker>
      )}

      <FitBounds points={positions} />
    </MapContainer>
  );
}
