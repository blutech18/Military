"use client";

import { MapContainer, TileLayer, Circle, Marker, useMapEvents, useMap, ZoomControl } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";

// Fix default Leaflet icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface GeofencePickerProps {
  latitude: number;
  longitude: number;
  radius: number;
  onChange: (lat: number, lng: number) => void;
}

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.setView([lat, lng], map.getZoom(), { animate: true });
    }
  }, [lat, lng, map]);
  return null;
}

export function GeofencePicker({ latitude, longitude, radius, onChange }: GeofencePickerProps) {
  const defaultLat = Number(process.env.NEXT_PUBLIC_DEFAULT_MAP_CENTER_LAT ?? 8.484460);
  const defaultLon = Number(process.env.NEXT_PUBLIC_DEFAULT_MAP_CENTER_LON ?? 124.657010);

  const center: [number, number] = [
    latitude || defaultLat,
    longitude || defaultLon,
  ];

  return (
    <div className="rounded-md overflow-hidden border border-steel-700/40">
      <MapContainer
        center={center}
        zoom={15}
        zoomControl={false}
        className="h-[200px] w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <ZoomControl position="topright" />
        <ClickHandler onChange={onChange} />
        <RecenterMap lat={latitude} lng={longitude} />

        {latitude && longitude && (
          <>
            <Marker position={[latitude, longitude]} />
            {radius > 0 && (
              <Circle
                center={[latitude, longitude]}
                radius={radius}
                pathOptions={{
                  color: "#aeb771",
                  weight: 1.5,
                  fillOpacity: 0.1,
                  dashArray: "4 6",
                }}
              />
            )}
          </>
        )}
      </MapContainer>
      <p className="text-[10px] text-steel-500 text-center py-1 bg-steel-900/80">
        Click on the map to set coordinates
      </p>
    </div>
  );
}
