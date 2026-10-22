"use client";

import { useEffect, useState } from "react";

import { DEFAULT_CENTER, isInIndia, type LatLng } from "@/lib/geo";

export type PositionState =
  | { status: "locating"; position: LatLng }
  | { status: "ok"; position: LatLng }
  | { status: "fallback"; position: LatLng; reason: "denied" | "unavailable" | "outside" };

/**
 * The browser's location, once. Falls back to the default city centre
 * when permission is denied, location fails, or the device is outside
 * India — Comet only operates in Bengaluru, and a visitor in another
 * country should still see a working demo there.
 */
export function useCurrentPosition(enabled = true): PositionState {
  const [state, setState] = useState<PositionState>({
    status: "locating",
    position: DEFAULT_CENTER,
  });

  useEffect(() => {
    // Not asked yet: a screen explaining why comes first ("15 · Permissions").
    if (!enabled) return;
    if (!("geolocation" in navigator)) {
      // Deferred like the callbacks below, so the effect body never sets
      // state synchronously.
      queueMicrotask(() =>
        setState({ status: "fallback", position: DEFAULT_CENTER, reason: "unavailable" }),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const here = { lat: coords.latitude, lng: coords.longitude };
        setState(
          isInIndia(here)
            ? { status: "ok", position: here }
            : { status: "fallback", position: DEFAULT_CENTER, reason: "outside" },
        );
      },
      (err) =>
        setState({
          status: "fallback",
          position: DEFAULT_CENTER,
          reason: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable",
        }),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 60_000 },
    );
  }, [enabled]);

  return state;
}
