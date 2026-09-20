"use client";

import { useEffect, useState } from "react";

let mountCounter = 0;

/**
 * Guards against Leaflet's "Map container is already initialized." error.
 *
 * Leaflet stamps an internal id onto the DOM node it initialises and refuses to
 * initialise that node twice. React 18 StrictMode deliberately mounts, unmounts
 * and remounts every component in development, and Fast Refresh does the same on
 * each edit, so react-leaflet ends up pointing at a node Leaflet still considers
 * taken.
 *
 * Passing the returned value as the `key` of `MapContainer` gives Leaflet a
 * brand-new node on every mount, so the stale id can never be reused.
 *
 * Returns null until the component has actually mounted, which also keeps the
 * map out of the server-rendered output.
 */
export function useMapMountKey(): string | null {
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    mountCounter += 1;
    // Setting state here is the point: the map must not be created until the
    // component has committed, so StrictMode's discarded first pass never leaves
    // a Leaflet id behind. One extra render on mount is the intended cost.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKey(`leaflet-map-${mountCounter}`);

    return () => setKey(null);
  }, []);

  return key;
}
