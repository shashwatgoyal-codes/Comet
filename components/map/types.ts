import type { LatLng } from "@/lib/geo";

/** What a map screen asks the map to show. Browser-safe. */
export type MapViewProps = {
  /** Where the map centres when there is no route to fit. */
  center: LatLng;
  /** The rider's own position, shown as the blue pulsing dot. */
  you?: LatLng;
  pickup?: LatLng;
  drop?: LatLng;
  /** The Pilot's car, moving live during a trip. */
  car?: LatLng;
  /**
   * Many vehicles at once (the ops city view): idle Pilots, trips in
   * progress and SOS alerts. Fitted on first show, not on every update.
   */
  fleet?: FleetMarker[];
  /** [lng, lat] pairs, GeoJSON order. */
  route?: [number, number][];
  /**
   * Fraction of the map hidden under the bottom sheet (0–1), so the route
   * is fitted into the visible part rather than behind the sheet.
   */
  bottomInset?: number;
  /**
   * Pixels hidden under a panel on the left (the desktop layout). Set by
   * LiveMap, not by screens.
   */
  leftInset?: number;
  className?: string;
};

export type FleetMarker = { id: string; point: LatLng; kind: "pilot" | "trip" | "sos" };

export { DEFAULT_CENTER } from "@/lib/geo";
