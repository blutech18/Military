"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { CircleMarker, Polyline } from "react-leaflet";
import { Route, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Road-aware GPS trail.
 *
 * Raw GPS fixes joined by straight lines cut across buildings and parks. Here the trail is
 * snapped onto the road network with OSRM map matching (OpenStreetMap data, same as the tiles):
 *   1. Standing-still jitter is dropped and straight stretches are simplified.
 *   2. The fixes are matched in chunks of at most 10 (the public OSRM servers refuse more).
 *      A chunk that cannot be matched is routed through its fixes instead, like a navigation route.
 *   3. A snapped piece that is far longer than the real distance (someone walked across a field)
 *      is drawn as a straight dashed line rather than an invented road detour.
 * Results are cached per chunk, so as new fixes arrive only the newest chunk is fetched.
 * If the routing server cannot be reached, the plain GPS trail is drawn.
 *
 * Server: NEXT_PUBLIC_ROUTING_URL (default the public OSRM demo, which allows about one request
 * per second) and NEXT_PUBLIC_ROUTING_PROFILE (default "driving").
 */

export type LatLng = [number, number];

export interface TrailFix {
  lat: number;
  lon: number;
  /** Capture time in Unix seconds; improves matching when present. */
  time?: number;
}

export interface TrailSegment {
  path: LatLng[];
  /** true = follows roads; false = drawn straight (pending, unmatched or implausible). */
  onRoad: boolean;
}

export type TrailMode = "roads" | "gps";
export type TrailStatus = "off" | "snapping" | "snapped" | "unavailable";

const ROUTING_URL = (process.env.NEXT_PUBLIC_ROUTING_URL || "https://router.project-osrm.org").replace(/\/+$/, "");
const ROUTING_PROFILE = process.env.NEXT_PUBLIC_ROUTING_PROFILE || "driving";

const MAX_FIXES_PER_REQUEST = 10;
const MIN_SPACING_M = 15;
const SIMPLIFY_TOLERANCE_M = 8;
const MATCH_RADIUS_M = 20;
const DETOUR_FACTOR = 3;
const DETOUR_ALLOWANCE_M = 400;
const REQUEST_GAP_MS = 1100;
const REQUEST_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------- geometry

function distanceM(a: TrailFix, b: TrailFix): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pathLengthM(fixes: TrailFix[]): number {
  let total = 0;
  for (let i = 1; i < fixes.length; i++) total += distanceM(fixes[i - 1], fixes[i]);
  return total;
}

/** Distance in metres from p to the segment a-b (local flat projection; fine at trail scale). */
function offsetFromSegmentM(p: TrailFix, a: TrailFix, b: TrailFix): number {
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const bx = (b.lon - a.lon) * mPerDegLon, by = (b.lat - a.lat) * mPerDegLat;
  const px = (p.lon - a.lon) * mPerDegLon, py = (p.lat - a.lat) * mPerDegLat;
  const lengthSq = bx * bx + by * by;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / lengthSq));
  return Math.hypot(px - t * bx, py - t * by);
}

function douglasPeucker(fixes: TrailFix[], toleranceM: number): TrailFix[] {
  if (fixes.length < 3) return fixes;
  const keep = new Array<boolean>(fixes.length).fill(false);
  keep[0] = keep[fixes.length - 1] = true;
  const stack: [number, number][] = [[0, fixes.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let worst = -1, worstOffset = 0;
    for (let i = start + 1; i < end; i++) {
      const offset = offsetFromSegmentM(fixes[i], fixes[start], fixes[end]);
      if (offset > worstOffset) { worstOffset = offset; worst = i; }
    }
    if (worst > 0 && worstOffset > toleranceM) {
      keep[worst] = true;
      stack.push([start, worst], [worst, end]);
    }
  }
  return fixes.filter((_, i) => keep[i]);
}

/** Drops standing-still jitter, then simplifies straight stretches. Keeps the newest fix as the end. */
export function simplifyTrail(fixes: TrailFix[]): TrailFix[] {
  if (fixes.length < 2) return fixes;
  const kept: TrailFix[] = [fixes[0]];
  for (let i = 1; i < fixes.length; i++) {
    if (distanceM(kept[kept.length - 1], fixes[i]) >= MIN_SPACING_M) kept.push(fixes[i]);
  }
  const newest = fixes[fixes.length - 1];
  if (kept[kept.length - 1] !== newest) {
    if (kept.length > 1) kept[kept.length - 1] = newest; else kept.push(newest);
  }
  return douglasPeucker(kept, SIMPLIFY_TOLERANCE_M);
}

/** Chunks of at most MAX_FIXES_PER_REQUEST that share their boundary fix, so the trail stays joined. */
export function chunkTrail(fixes: TrailFix[]): TrailFix[][] {
  const chunks: TrailFix[][] = [];
  for (let start = 0; start < fixes.length - 1; start += MAX_FIXES_PER_REQUEST - 1) {
    chunks.push(fixes.slice(start, start + MAX_FIXES_PER_REQUEST));
  }
  return chunks;
}

// ---------------------------------------------------------------- routing server

/** The parts of OSRM's match / route answers that are used here. */
interface OsrmGeometry {
  geometry: { coordinates: [number, number][] };
  distance?: number;
}
interface OsrmResponse {
  code?: string;
  matchings?: OsrmGeometry[];
  routes?: OsrmGeometry[];
}

let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

/** One request at a time, spaced REQUEST_GAP_MS apart (public OSRM usage policy). */
function queuedFetchJson(url: string): Promise<OsrmResponse> {
  const run = async () => {
    const wait = lastRequestAt + REQUEST_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      // OSRM answers "no match" with HTTP 400 and a JSON body; other errors are real failures.
      if (!res.ok && res.status !== 400) throw new Error(`routing server answered ${res.status}`);
      return (await res.json()) as OsrmResponse;
    } finally {
      clearTimeout(timer);
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

function toLatLngs(coordinates: [number, number][]): LatLng[] {
  return coordinates.map(([lon, lat]) => [lat, lon] as LatLng);
}

const resolved = new Map<string, TrailSegment[]>();
const pending = new Map<string, Promise<TrailSegment[]>>();

function chunkKey(chunk: TrailFix[]): string {
  return chunk.map((f) => `${f.lon.toFixed(6)},${f.lat.toFixed(6)}`).join(";");
}

async function snapChunk(chunk: TrailFix[]): Promise<TrailSegment[]> {
  const coords = chunkKey(chunk);
  const straight: TrailSegment[] = [{ path: chunk.map((f) => [f.lat, f.lon] as LatLng), onRoad: false }];
  const realLength = pathLengthM(chunk);

  const times = chunk.map((f) => f.time);
  const increasing = times.every((t, i) => t != null && (i === 0 || t > (times[i - 1] as number)));
  const matchUrl =
    `${ROUTING_URL}/match/v1/${ROUTING_PROFILE}/${coords}?geometries=geojson&overview=full&tidy=true&gaps=ignore` +
    `&radiuses=${chunk.map(() => MATCH_RADIUS_M).join(";")}` +
    (increasing ? `&timestamps=${times.map((t) => Math.round(t as number)).join(";")}` : "");

  let path: LatLng[] = [];
  let roadLength = 0;
  const match = await queuedFetchJson(matchUrl);
  if (match?.code === "Ok" && Array.isArray(match.matchings) && match.matchings.length > 0) {
    for (const m of match.matchings) {
      path = path.concat(toLatLngs(m.geometry.coordinates));
      roadLength += m.distance ?? 0;
    }
  } else {
    // Could not be matched as a trace: route through the fixes, like a navigation route.
    const route = await queuedFetchJson(`${ROUTING_URL}/route/v1/${ROUTING_PROFILE}/${coords}?geometries=geojson&overview=full`);
    if (route?.code !== "Ok" || !route.routes?.length) return straight;
    path = toLatLngs(route.routes[0].geometry.coordinates);
    roadLength = route.routes[0].distance ?? 0;
  }

  if (path.length < 2) return straight;
  // A road path far longer than the real movement is not believable (off-road walk, one-way detour).
  if (roadLength > realLength * DETOUR_FACTOR && roadLength - realLength > DETOUR_ALLOWANCE_M) return straight;
  return [{ path, onRoad: true }];
}

function getSnapped(chunk: TrailFix[]): Promise<TrailSegment[]> {
  const key = chunkKey(chunk);
  const done = resolved.get(key);
  if (done) return Promise.resolve(done);
  let inFlight = pending.get(key);
  if (!inFlight) {
    inFlight = snapChunk(chunk)
      .then((segments) => { resolved.set(key, segments); return segments; })
      .finally(() => pending.delete(key)); // failures are not cached, so they are retried later
    pending.set(key, inFlight);
  }
  return inFlight;
}

// ---------------------------------------------------------------- React

/**
 * Road-snapped segments for a trail. `fixes` must be in time order (oldest first).
 * Chunks that are still loading or failed are returned as straight GPS lines, so the trail is
 * always complete and fills in road by road.
 */
export function useRoadTrail(fixes: TrailFix[], enabled: boolean): { segments: TrailSegment[]; status: TrailStatus } {
  const chunks = useMemo(() => chunkTrail(simplifyTrail(fixes)), [fixes]);
  const chunksId = useMemo(() => chunks.map(chunkKey).join("|"), [chunks]);
  const [, setVersion] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Newest chunk first: on the live map that is the part people look at.
    [...chunks].reverse().forEach((chunk) => {
      const key = chunkKey(chunk);
      if (resolved.has(key)) return;
      getSnapped(chunk).then(
        () => { if (!cancelled) setVersion((v) => v + 1); },
        () => { if (!cancelled) setFailed((prev) => new Set(prev).add(key)); },
      );
    });
    return () => { cancelled = true; };
    // chunksId carries the chunk contents; `chunks` itself is a new array on every new fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunksId, enabled]);

  if (!enabled) return { segments: [], status: "off" };

  let waiting = false, unavailable = false;
  const segments: TrailSegment[] = [];
  for (const chunk of chunks) {
    const key = chunkKey(chunk);
    const done = resolved.get(key);
    if (done) { segments.push(...done); continue; }
    if (failed.has(key)) unavailable = true; else waiting = true;
    segments.push({ path: chunk.map((f) => [f.lat, f.lon] as LatLng), onRoad: false });
  }
  const status: TrailStatus = unavailable ? "unavailable" : waiting ? "snapping" : "snapped";
  return { segments, status };
}

/** Roads / GPS choice, remembered in this browser. (The maps render client-side only.) */
export function useTrailMode(): [TrailMode, (mode: TrailMode) => void] {
  const [mode, setMode] = useState<TrailMode>(() => {
    try {
      return window.localStorage.getItem("armory-trail-mode") === "gps" ? "gps" : "roads";
    } catch {
      return "roads"; // storage unavailable
    }
  });
  const choose = (next: TrailMode) => {
    setMode(next);
    try { window.localStorage.setItem("armory-trail-mode", next); } catch { /* not remembered */ }
  };
  return [mode, choose];
}

/** The trail itself; render inside a react-leaflet MapContainer. */
export function RoadTrailLayer({
  fixes,
  mode,
  segments,
  color = "#aeb771",
}: {
  fixes: TrailFix[];
  mode: TrailMode;
  segments: TrailSegment[];
  color?: string;
}) {
  if (fixes.length < 2) return null;
  const raw = fixes.map((f) => [f.lat, f.lon] as LatLng);

  if (mode === "gps") {
    return <Polyline positions={raw} pathOptions={{ color, weight: 2.5, opacity: 0.8 }} />;
  }

  return (
    <>
      {segments.map((segment, i) =>
        segment.onRoad ? (
          <Fragment key={i}>
            {/* dark casing under the line, like a navigation route */}
            <Polyline positions={segment.path} pathOptions={{ color: "#11160a", weight: 7, opacity: 0.85, lineCap: "round", lineJoin: "round" }} />
            <Polyline positions={segment.path} pathOptions={{ color, weight: 4, opacity: 0.95, lineCap: "round", lineJoin: "round" }} />
          </Fragment>
        ) : (
          <Polyline key={i} positions={segment.path} pathOptions={{ color, weight: 2, opacity: 0.6, dashArray: "4 6" }} />
        )
      )}
      {/* the actual GPS fixes stay visible */}
      {raw.map((p, i) => (
        <CircleMarker key={`fix-${i}`} center={p} radius={2} pathOptions={{ color, weight: 0, fillColor: color, fillOpacity: 0.55 }} />
      ))}
    </>
  );
}

/** Roads / GPS switch with snapping status; render as an overlay next to the map. */
export function TrailModeToggle({
  mode,
  onChange,
  status,
  className,
}: {
  mode: TrailMode;
  onChange: (mode: TrailMode) => void;
  status: TrailStatus;
  className?: string;
}) {
  const note =
    mode !== "roads" ? null
      : status === "snapping" ? "Snapping to roads…"
      : status === "unavailable" ? "Road data unavailable · showing GPS"
      : null;

  return (
    <div className={cn("absolute z-[500] flex flex-col items-end gap-1", className)}>
      <div
        role="group"
        aria-label="Trail style"
        className="flex overflow-hidden rounded-md border border-steel-600/60 bg-steel-900/90 text-[11px] font-semibold shadow-md backdrop-blur-sm"
      >
        <button
          type="button"
          onClick={() => onChange("roads")}
          aria-pressed={mode === "roads"}
          title="Draw the trail along the roads (map matching, OpenStreetMap / OSRM)"
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 transition",
            mode === "roads" ? "bg-olive-900/90 text-olive-100" : "text-steel-300 hover:text-olive-200"
          )}
        >
          <Route className="h-3.5 w-3.5" />
          Roads
        </button>
        <button
          type="button"
          onClick={() => onChange("gps")}
          aria-pressed={mode === "gps"}
          title="Draw straight lines between the raw GPS fixes"
          className={cn(
            "flex items-center gap-1.5 border-l border-steel-700/70 px-2.5 py-1.5 transition",
            mode === "gps" ? "bg-olive-900/90 text-olive-100" : "text-steel-300 hover:text-olive-200"
          )}
        >
          <Waypoints className="h-3.5 w-3.5" />
          GPS
        </button>
      </div>
      {note && (
        <span className="pointer-events-none rounded bg-steel-900/85 px-1.5 py-0.5 text-[10px] text-steel-300">{note}</span>
      )}
    </div>
  );
}
