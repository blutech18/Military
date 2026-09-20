/**
 * Basemap tile source, shared by every map component.
 *
 * The project previously used CARTO's dark_all basemap. CARTO now requires an
 * API key for that service, and unauthenticated requests return tiles stamped
 * "API KEY REQUIRED", which is what appeared across the map.
 *
 * The default below is OpenStreetMap's standard tile server: no key, no signup.
 * It serves light tiles, so TILE_DARKEN applies a CSS filter to the tile layer
 * only (markers, geofence circles and popups keep their own colours).
 *
 * To use a commercial provider instead, set these in .env.local and turn the
 * filter off if the provider already serves dark tiles:
 *
 *   NEXT_PUBLIC_MAP_TILE_URL=https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=YOUR_KEY
 *   NEXT_PUBLIC_MAP_TILE_ATTRIBUTION=&copy; CARTO &copy; OpenStreetMap contributors
 *   NEXT_PUBLIC_MAP_TILE_DARKEN=false
 *
 * Note on usage limits: the OpenStreetMap tile server is fine for development
 * and a demo, but its usage policy discourages heavy or commercial traffic.
 * A deployed system should use a keyed provider or a self-hosted tile server.
 */
export const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const TILE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ??
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const TILE_MAX_ZOOM = Number(process.env.NEXT_PUBLIC_MAP_TILE_MAX_ZOOM ?? 19);

/** Apply the dark CSS filter to tiles. Set to false for a natively dark provider. */
export const TILE_DARKEN = (process.env.NEXT_PUBLIC_MAP_TILE_DARKEN ?? "true") === "true";

/** Class that activates the tile-only dark filter defined in globals.css. */
export const TILE_DARKEN_CLASS = TILE_DARKEN ? "map-dark-tiles" : "";
