"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtRelative } from "@/lib/utils";

const LiveMap = dynamic(() => import("@/components/maps/live-map").then((m) => m.LiveMap), { ssr: false });
const RouteHistoryMap = dynamic(() => import("@/components/maps/route-history-map").then((m) => m.RouteHistoryMap), { ssr: false });

export default function GpsPage() {
  const [selectedFirearm, setSelectedFirearm] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: ["gps-live"],
    queryFn: async () => (await api.get("/gps/live")).data,
    refetchInterval: 30_000,
  });

  const { data: history } = useQuery({
    queryKey: ["gps-history", selectedFirearm],
    queryFn: async () => (await api.get(`/gps/history/${selectedFirearm}`, { params: { limit: 500 } })).data,
    enabled: !!selectedFirearm,
  });

  return (
    <div className="space-y-5">
      <div>
          <h1 className="text-2xl font-bold text-olive-50">Real-Time GPS</h1>
        <p className="text-sm text-steel-400">
          Live coordinates come from ESP32 + GY-NEO6MV2 trackers. If a tracker is offline, the map labels the point as last known or placeholder.
        </p>
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 glass rounded-xl p-2 h-[600px] overflow-hidden">
          {selectedFirearm && history ? (
            <RouteHistoryMap history={history} geofences={data?.geofences} />
          ) : (
            <LiveMap />
          )}
        </div>
        <div className="glass rounded-xl p-4 max-h-[600px] overflow-y-auto">
          <div className="mb-3">
            <p className="section-title">Tracked Firearms</p>
            {data?.items && (
              <p className="mt-1 text-[11px] text-steel-400">
                {data.items.filter((i: any) => i.telemetry_source === "iot").length} live IoT ·{" "}
                {data.items.filter((i: any) => i.telemetry_source === "stale").length} last known ·{" "}
                {data.items.filter((i: any) => i.telemetry_source === "placeholder").length} placeholder
              </p>
            )}
          </div>
          {selectedFirearm && (
            <button
              onClick={() => setSelectedFirearm(null)}
              className="btn-secondary text-xs w-full mb-3"
            >
              ← Back to Live Map
            </button>
          )}
          {data?.items?.length === 0 && <p className="text-steel-400 text-sm">No firearms currently tracked.</p>}
          <ul className="space-y-3">
            {data?.items?.map((i: any) => (
              <li
                key={i.equipment_id}
                className={`rounded-md border p-3 cursor-pointer transition-all ${
                  selectedFirearm === i.equipment_id
                    ? "border-olive-400/60 bg-olive-900/30"
                    : "border-olive-700/30 bg-steel-900/50 hover:border-olive-500/40"
                }`}
                onClick={() => setSelectedFirearm(i.equipment_id)}
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <p className="text-sm font-bold text-olive-100 font-mono">{i.serial_number}</p>
                    <p className="text-xs text-steel-400">{i.model}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`pill pill-${i.status === "Overdue" ? "critical" : "info"}`}>{i.status}</span>
                    <span className={`pill ${telemetryPill(i.telemetry_source)}`}>{telemetryLabel(i.telemetry_source)}</span>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-steel-300 space-y-0.5">
                  <p>Issued to: <span className="text-olive-200">{i.assigned_to ?? "—"}</span></p>
                  <p>Last GPS: {i.captured_at ? fmtRelative(i.captured_at) : "No live fix yet"}</p>
                  <p className="font-mono">{Number(i.lat).toFixed(5)}, {Number(i.lon).toFixed(5)}</p>
                  {i.battery_pct != null && <p>Battery: {i.battery_pct}%</p>}
                  {i.device_id && <p>Device: {i.device_id}</p>}
                  <p>{i.location_note}</p>
                  {i.telemetry_source !== "placeholder" && (
                    <p>Geofence: {i.inside_geofence ? "✓ inside" : "⚠︎ outside"}</p>
                  )}
                </div>
                {selectedFirearm === i.equipment_id && (
                  <p className="mt-2 text-[10px] text-olive-300 uppercase tracking-widest">
                    Showing route history
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function telemetryPill(source: string): string {
  if (source === "iot") return "pill-ok";
  if (source === "stale") return "pill-warn";
  if (source === "placeholder") return "pill-muted";
  return "pill-critical";
}

function telemetryLabel(source: string): string {
  if (source === "iot") return "Live IoT";
  if (source === "stale") return "Last Known";
  if (source === "placeholder") return "Placeholder";
  return "Missing";
}
