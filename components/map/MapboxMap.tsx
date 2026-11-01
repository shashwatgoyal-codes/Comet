"use client";

import "mapbox-gl/dist/mapbox-gl.css";

import mapboxgl from "mapbox-gl";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { FallbackMap } from "./FallbackMap";
import type { FleetMarker, MapViewProps } from "./types";

/**
 * The real map. Loaded only on map screens (LiveMap imports it lazily),
 * so the ~200 KB of Mapbox GL never weighs on pages without a map.
 *
 * The style follows the app theme. If Mapbox fails to load (bad token,
 * blocked network), the drawn fallback takes over so the screen still
 * works.
 */

const STYLE = {
  light: "mapbox://styles/mapbox/light-v11",
  dark: "mapbox://styles/mapbox/dark-v11",
};

function fleetEl(kind: FleetMarker["kind"]) {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.className =
    kind === "sos"
      ? "size-4 rounded-full border-[3px] border-white bg-danger-text shadow-float ring-8 ring-danger-text/25"
      : kind === "trip"
        ? "size-3 rounded-[3px] border-2 border-white bg-primary"
        : "size-3 rounded-[3px] border-2 border-ink bg-white";
  return el;
}

function markerEl(kind: "you" | "pickup" | "drop" | "car") {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.className =
    kind === "car"
      ? "h-[30px] w-[18px] rounded-md border-[2.5px] border-white bg-primary shadow-float"
      : kind === "you"
        ? "size-5 rounded-full border-4 border-white bg-info shadow-float"
        : kind === "pickup"
          ? "size-[18px] rounded-full border-[5px] border-ink bg-white"
          : "size-5 rounded-[4px] border-[3px] border-white bg-ink";
  return el;
}

export default function MapboxMap(props: MapViewProps) {
  const {
    center,
    you,
    pickup,
    drop,
    car,
    fleet,
    route,
    bottomInset = 0,
    leftInset = 0,
    className,
  } = props;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const carMarker = useRef<mapboxgl.Marker | null>(null);
  const fleetMarkers = useRef<mapboxgl.Marker[]>([]);
  const fleetFitted = useRef(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const dark = document.documentElement.classList.contains("dark");
    try {
      mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;
      const m = new mapboxgl.Map({
        container: container.current,
        style: dark ? STYLE.dark : STYLE.light,
        center: [center.lng, center.lat],
        zoom: 14,
        attributionControl: false,
        cooperativeGestures: false,
      });
      m.addControl(new mapboxgl.AttributionControl({ compact: true }), "top-left");
      m.on("load", () => setReady(true));
      m.on("error", (e) => {
        // A failed style or token load leaves a blank canvas; swap it out.
        if (!m.isStyleLoaded()) setFailed(true);
        console.warn("map error", e.error?.message);
      });
      map.current = m;
    } catch {
      // No WebGL, or Mapbox refused to start. Deferred so the effect body
      // itself never sets state (a render cascade the compiler flags).
      queueMicrotask(() => setFailed(true));
    }
    return () => {
      map.current?.remove();
      map.current = null;
    };
    // The map is created once; later prop changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tripKey = JSON.stringify([
    center,
    you,
    pickup,
    drop,
    route?.length,
    route?.[0],
    route?.at(-1),
    bottomInset,
    leftInset,
  ]);

  // Route, markers and framing whenever the trip changes.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;

    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    const add = (
      p: { lat: number; lng: number } | undefined,
      kind: "you" | "pickup" | "drop" | "car",
    ) => {
      if (p)
        markers.current.push(
          new mapboxgl.Marker({ element: markerEl(kind) }).setLngLat([p.lng, p.lat]).addTo(m),
        );
    };
    if (!pickup) add(you, "you");
    add(pickup, "pickup");
    add(drop, "drop");

    const data: GeoJSON.Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: route ?? [] },
    };
    const source = m.getSource("route") as mapboxgl.GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      m.addSource("route", { type: "geojson", data });
      m.addLayer({
        id: "route-halo",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#FFD9C7", "line-width": 11, "line-opacity": 0.9 },
      });
      m.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#FF6B2C", "line-width": 5 },
      });
    }

    const height = m.getContainer().clientHeight;
    const padding = {
      top: 90,
      left: 48 + leftInset,
      right: 48,
      bottom: Math.round(height * bottomInset) + 40,
    };
    if (route && route.length > 1) {
      const bounds = route.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(route[0], route[0]),
      );
      m.fitBounds(bounds, { padding, duration: 600, maxZoom: 16 });
    } else {
      m.easeTo({ center: [center.lng, center.lat], padding, duration: 600, zoom: 14.5 });
    }
    // Keyed on the values, not object identity: a poll that returns the
    // same trip must not re-frame the map under the rider's finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tripKey]);

  // The car moves on its own, every few seconds, without re-framing.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    if (!car) {
      carMarker.current?.remove();
      carMarker.current = null;
      return;
    }
    if (!carMarker.current) {
      carMarker.current = new mapboxgl.Marker({ element: markerEl("car") })
        .setLngLat([car.lng, car.lat])
        .addTo(m);
    } else {
      carMarker.current.setLngLat([car.lng, car.lat]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, car?.lat, car?.lng]);

  // The ops fleet: redrawn on each update, fitted to the city once.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !fleet) return;
    fleetMarkers.current.forEach((mk) => mk.remove());
    fleetMarkers.current = fleet.map((f) =>
      new mapboxgl.Marker({ element: fleetEl(f.kind) })
        .setLngLat([f.point.lng, f.point.lat])
        .addTo(m),
    );
    if (!fleetFitted.current && fleet.length > 1) {
      fleetFitted.current = true;
      const first: [number, number] = [fleet[0]!.point.lng, fleet[0]!.point.lat];
      const bounds = fleet.reduce(
        (b, f) => b.extend([f.point.lng, f.point.lat]),
        new mapboxgl.LngLatBounds(first, first),
      );
      m.fitBounds(bounds, { padding: 60, duration: 0, maxZoom: 14 });
    }
  }, [ready, fleet]);

  if (failed) return <FallbackMap {...props} />;
  return (
    <div ref={container} className={cn("h-full w-full", className)} data-testid="mapbox-map" />
  );
}
