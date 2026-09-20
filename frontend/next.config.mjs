/** @type {import('next').NextConfig} */
const nextConfig = {
  /*
   * Disabled because react-leaflet 4.2.1 cannot survive a StrictMode remount.
   *
   * In node_modules/react-leaflet/lib/MapContainer.js the ref callback is:
   *
   *   const mapRef = useCallback((node) => {
   *     if (node !== null && context === null) {
   *       const map = new LeafletMap(node, options);
   *       ...
   *     }
   *   }, []);            // empty deps: `context` stays null in this closure
   *
   * Because the closure always sees context === null, the guard never blocks a
   * second initialisation. StrictMode deliberately mounts, unmounts and remounts
   * in development, reattaching the ref to the SAME DOM node, so Leaflet is asked
   * to initialise a container it already owns and throws
   * "Map container is already initialized."
   *
   * This only affects development: React never double-mounts in a production
   * build, so `next build` output was never impacted.
   *
   * Re-enable this once the map components move to react-leaflet 5, which needs
   * React 19. Until then, keep the useMapMountKey hook in
   * src/components/maps/use-map-mount-key.ts, which guarantees a fresh container
   * across Fast Refresh remounts.
   */
  devIndicators: {
    position: "bottom-right",
  },
  reactStrictMode: false,
};

export default nextConfig;
