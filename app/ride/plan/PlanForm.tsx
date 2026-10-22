"use client";

import { ArrowLeft, Briefcase, Home, LocateFixed, LocateOff, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import type { LatLng } from "@/lib/geo";
import type { Place } from "@/lib/mapbox/types";
import type { SavedPlaceView } from "@/lib/services/places";
import { tripSearchParams } from "@/lib/trip-params";
import { useCurrentPosition } from "@/lib/use-current-position";
import { cn } from "@/lib/utils";

import { searchPlacesAction } from "../actions";

const DEBOUNCE_MS = 250;

type Picked = { address: string; point: LatLng };
type Field = "pickup" | "drop";

const PLACE_ICONS = { home: Home, work: Briefcase, other: MapPin };

/**
 * "3 · Plan ride": pickup (your location by default, or searched, or a
 * saved place) and destination. With location off ("State · Location
 * off") the rider types the pickup instead.
 */
export function PlanForm({ savedPlaces }: { savedPlaces: SavedPlaceView[] }) {
  const router = useRouter();
  const position = useCurrentPosition();
  const [field, setField] = useState<Field>("drop");
  const [pickup, setPickup] = useState<Picked | null>(null);
  const [texts, setTexts] = useState<Record<Field, string>>({ pickup: "", drop: "" });
  // Results are kept with the query that produced them, so a short or
  // changed query simply hides stale results instead of resetting state.
  const [found, setFound] = useState<{ query: string; places: Place[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const latest = useRef(0);
  const dropRef = useRef<HTMLInputElement>(null);

  const query = texts[field];
  const trimmed = query.trim();
  const tooShort = trimmed.length < 3;
  const results = !tooShort && found?.query === trimmed ? found.places : [];
  const searched = !tooShort && found?.query === trimmed;
  const locationOff = position.status === "fallback" && position.reason !== "outside";

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const result = await searchPlacesAction({ query: q, near: position.position });
        // Ignore answers to queries the rider has already typed past.
        if (ticket !== latest.current) return;
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setError(null);
        setFound({ query: q, places: result.data });
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, position.position]);

  const fromHere: Picked = {
    address: position.status === "ok" ? "Current location" : "HSR Layout, Bengaluru",
    point: position.position,
  };

  function choose(place: Picked) {
    if (field === "pickup") {
      setPickup(place);
      setTexts((t) => ({ ...t, pickup: place.address }));
      setField("drop");
      requestAnimationFrame(() => dropRef.current?.focus());
      return;
    }
    router.push(`/ride/choose?${tripSearchParams(pickup ?? fromHere, place)}`);
  }

  const showSaved = tooShort && savedPlaces.length > 0;

  return (
    <div className="flex min-h-dvh flex-col bg-card md:mx-auto md:min-h-0 md:max-w-[640px] md:overflow-hidden md:rounded-3xl md:shadow-float">
      <div className="flex flex-col gap-4 border-b border-border px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/ride"
            aria-label="Back"
            className="flex size-11 items-center justify-center rounded-full bg-muted"
          >
            <ArrowLeft className="size-[22px]" aria-hidden strokeWidth={2.2} />
          </Link>
          <h1 className="font-heading text-[22px] font-bold tracking-tight">Plan your ride</h1>
        </div>

        {locationOff && (
          <div
            role="status"
            className="flex gap-3 rounded-md bg-warn-soft px-3.5 py-3 text-sm text-warn"
          >
            <LocateOff className="mt-0.5 size-[18px] shrink-0" aria-hidden />
            <span>
              <b>Location is off.</b> Enter your pickup below, or allow location for this site in
              your browser settings.
            </span>
          </div>
        )}

        <div className="flex items-stretch gap-3">
          <div className="flex w-5 flex-col items-center py-[22px]" aria-hidden>
            <span className="size-3 rounded-full border-[3px] border-info" />
            <span className="my-1 w-0.5 flex-1 bg-border" />
            <span className="size-3 rounded-[3px] bg-foreground" />
          </div>
          <div className="flex flex-1 flex-col gap-2.5">
            <label htmlFor="pickup" className="sr-only">
              Pickup
            </label>
            <div className="relative">
              <LocateFixed
                className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-info"
                aria-hidden
              />
              <Input
                id="pickup"
                autoComplete="off"
                placeholder={
                  position.status === "locating" ? "Finding your location…" : fromHere.address
                }
                value={texts.pickup}
                onFocus={() => setField("pickup")}
                onChange={(e) => {
                  setPickup(null);
                  setTexts((t) => ({ ...t, pickup: e.target.value }));
                }}
                className={cn(
                  "h-[52px] rounded-md bg-muted pl-10 text-base font-medium placeholder:text-foreground",
                  field === "pickup" ? "border-2 border-primary bg-card" : "border-transparent",
                )}
              />
            </div>
            <label htmlFor="destination" className="sr-only">
              Destination
            </label>
            <Input
              id="destination"
              ref={dropRef}
              autoFocus={!locationOff}
              autoComplete="off"
              placeholder="Where to?"
              value={texts.drop}
              onFocus={() => setField("drop")}
              onChange={(e) => setTexts((t) => ({ ...t, drop: e.target.value }))}
              className={cn(
                "h-[52px] rounded-md px-4 text-base font-medium",
                field === "drop"
                  ? "border-2 border-primary bg-card"
                  : "border-transparent bg-muted",
              )}
            />
          </div>
        </div>
        {position.status === "fallback" && position.reason === "outside" && (
          <p className="text-xs text-muted-foreground">
            Comet runs in Bengaluru, so trips start from HSR Layout for now.
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col px-5" aria-live="polite" aria-busy={pending}>
        {error && (
          <p role="alert" className="py-4 text-sm font-semibold text-danger-text">
            {error}
          </p>
        )}
        {showSaved && (
          <>
            <h2 className="pt-4 pb-1 text-xs font-bold tracking-widest text-muted-foreground uppercase">
              {field === "pickup" ? "Pick up from a saved place" : "Saved places"}
            </h2>
            {field === "pickup" && position.status === "ok" && pickup && (
              <button
                type="button"
                onClick={() => {
                  setPickup(null);
                  setTexts((t) => ({ ...t, pickup: "" }));
                  setField("drop");
                }}
                className="flex items-center gap-3.5 border-b border-border py-3.5 text-left font-semibold text-info"
              >
                <LocateFixed className="size-[18px]" aria-hidden />
                Use my current location
              </button>
            )}
            {savedPlaces.map((p) => {
              const Icon = PLACE_ICONS[p.label];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    choose({
                      address: p.name === p.address ? p.address : `${p.name} · ${p.address}`,
                      point: p.point,
                    })
                  }
                  className="flex items-center gap-3.5 border-b border-border py-3.5 text-left"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-semibold">{p.name}</span>
                    <span className="truncate text-sm text-muted-foreground">{p.address}</span>
                  </span>
                </button>
              );
            })}
          </>
        )}
        {results.map((place) => (
          <button
            key={place.id}
            type="button"
            onClick={() => choose({ address: place.name, point: place.point })}
            className="flex items-center gap-3.5 border-b border-border py-3.5 text-left"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <MapPin className="size-[18px]" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-semibold">{place.name}</span>
              <span className="truncate text-sm text-muted-foreground">{place.address}</span>
            </span>
          </button>
        ))}
        {searched && results.length === 0 && !pending && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No places found. Try a landmark or area name.
          </p>
        )}
        {!searched && tooShort && !showSaved && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Type at least 3 letters to search.
          </p>
        )}
      </div>
    </div>
  );
}
