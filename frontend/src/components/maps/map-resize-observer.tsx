"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";

/**
 * Keeps Leaflet's internal viewport dimensions synchronized with its real card.
 *
 * Dashboard cards can resize without a window.resize event (responsive grid,
 * sidebar transitions, chart content, font loading). Leaflet otherwise keeps the
 * old pixel dimensions, leaving an unpainted strip below or beside the tiles.
 */
export function MapResizeObserver() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    let frame = 0;

    const resize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        map.invalidateSize({ animate: false, pan: false });
      });
    };

    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(resize)
      : null;

    observer?.observe(container);
    window.addEventListener("resize", resize);

    // Catch initial CSS layout and delayed font/sidebar transitions.
    resize();
    const delayed = window.setTimeout(resize, 300);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      window.clearTimeout(delayed);
      window.cancelAnimationFrame(frame);
    };
  }, [map]);

  return null;
}
