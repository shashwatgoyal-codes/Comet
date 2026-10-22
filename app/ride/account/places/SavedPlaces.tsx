"use client";

import { Briefcase, Home, MapPin, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { PLACE_LABELS, type PlaceLabel } from "@/lib/account";
import type { Place } from "@/lib/mapbox/types";
import type { SavedPlaceView } from "@/lib/services/places";
import { cn } from "@/lib/utils";

import { searchPlacesAction } from "../../actions";
import { addPlaceAction, deletePlaceAction, updatePlaceAction } from "../actions";

const ICONS = { home: Home, work: Briefcase, other: MapPin };
const LABELS: Record<PlaceLabel, string> = { home: "Home", work: "Work", other: "Other" };

const field =
  "h-[50px] w-full rounded-md border border-border bg-muted px-3.5 text-[15px] outline-none focus:border-primary focus:bg-card";

/** The list and the add/edit form of "14 · Saved places". */
export function SavedPlaces({ initial }: { initial: SavedPlaceView[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<SavedPlaceView | null>(null);
  const [label, setLabel] = useState<PlaceLabel>("other");
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Place | null>(null);
  const [found, setFound] = useState<{ query: string; places: Place[] } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const latest = useRef(0);

  const q = query.trim();
  const suggestions = !picked && q.length >= 3 && found?.query === q ? found.places : [];

  useEffect(() => {
    if (picked || q.length < 3) return;
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      const result = await searchPlacesAction({ query: q });
      if (ticket === latest.current && result.ok) setFound({ query: q, places: result.data });
    }, 250);
    return () => clearTimeout(timer);
  }, [q, picked]);

  function reset() {
    setEditing(null);
    setLabel("other");
    setName("");
    setQuery("");
    setPicked(null);
  }

  function edit(p: SavedPlaceView) {
    setEditing(p);
    setLabel(p.label);
    setName(p.name);
    setQuery(p.address);
    setPicked({ id: p.id, name: p.address, address: p.address, point: p.point });
    setMessage(null);
  }

  function save() {
    if (!picked) return;
    setMessage(null);
    const place = {
      label,
      name: name.trim() || LABELS[label],
      // What the rider sees in the field after choosing a suggestion.
      address: query.trim(),
      point: picked.point,
    };
    startTransition(async () => {
      const result = editing
        ? await updatePlaceAction({ placeId: editing.id, ...place })
        : await addPlaceAction(place);
      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
        return;
      }
      setMessage({ ok: true, text: editing ? "Place updated." : "Place saved." });
      reset();
      router.refresh();
    });
  }

  function remove(p: SavedPlaceView) {
    setMessage(null);
    startTransition(async () => {
      const result = await deletePlaceAction({ placeId: p.id });
      if (!result.ok) setMessage({ ok: false, text: result.message });
      else {
        if (editing?.id === p.id) reset();
        router.refresh();
      }
    });
  }

  return (
    <>
      {initial.length > 0 ? (
        <ul aria-label="Your places" className="overflow-hidden rounded-xl bg-card">
          {initial.map((p, i) => {
            const Icon = ICONS[p.label];
            return (
              <li
                key={p.id}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-3",
                  i > 0 && "border-t border-border",
                )}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">{p.name}</span>
                  <span className="truncate text-[13px] text-muted-foreground">{p.address}</span>
                </span>
                <button
                  type="button"
                  onClick={() => edit(p)}
                  aria-label={`Edit ${p.name}`}
                  className="flex size-10 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted"
                >
                  <Pencil className="size-[18px]" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => remove(p)}
                  disabled={pending}
                  aria-label={`Delete ${p.name}`}
                  className="flex size-10 items-center justify-center rounded-sm text-danger-text hover:bg-danger-soft"
                >
                  <Trash2 className="size-[18px]" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl bg-card p-5 text-center text-sm text-muted-foreground">
          No saved places yet. Add Home and Work to book them in one tap.
        </p>
      )}

      <section
        aria-labelledby="place-form"
        className="flex flex-col gap-3.5 rounded-xl bg-card p-5"
      >
        <h2 id="place-form" className="font-heading text-lg font-bold">
          {editing ? `Edit ${editing.name}` : "Add a place"}
        </h2>
        <div className="flex flex-col gap-1.5">
          <span id="label-label" className="text-[13px] font-semibold text-muted-foreground">
            Label
          </span>
          <div role="radiogroup" aria-labelledby="label-label" className="flex gap-2">
            {PLACE_LABELS.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={label === l}
                onClick={() => setLabel(l)}
                className={cn(
                  "h-10 rounded-full border-2 px-3.5 text-sm font-semibold",
                  label === l ? "border-primary bg-brand-soft" : "border-border",
                )}
              >
                {LABELS[l]}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted-foreground">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 60))}
            placeholder={LABELS[label] === "Other" ? "e.g. Mom's place" : LABELS[label]}
            className={cn(field, "font-normal text-foreground")}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted-foreground">
          Address
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
            }}
            placeholder="Search for an address"
            className={cn(field, "font-normal text-foreground")}
          />
        </label>
        {suggestions.length > 0 && (
          <ul
            aria-label="Address suggestions"
            className="-mt-1 overflow-hidden rounded-md border border-border"
          >
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setPicked(s);
                    setQuery(
                      s.address && s.address !== s.name ? `${s.name}, ${s.address}` : s.name,
                    );
                  }}
                  className="flex w-full flex-col gap-0.5 border-b border-border px-3.5 py-2.5 text-left last:border-b-0 hover:bg-muted"
                >
                  <span className="text-sm font-semibold">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.address}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {message && (
          <p
            role={message.ok ? "status" : "alert"}
            className={cn("text-sm font-semibold", message.ok ? "text-info" : "text-danger-text")}
          >
            {message.text}
          </p>
        )}
        <div className="flex gap-2">
          {editing && (
            <Button variant="outline" onClick={reset} className="h-14 flex-1 rounded-lg font-bold">
              Cancel
            </Button>
          )}
          <Button
            onClick={save}
            disabled={pending || !picked}
            className="h-14 flex-[2] rounded-lg text-[17px] font-bold"
          >
            {pending ? "Saving…" : "Save place"}
          </Button>
        </div>
      </section>
    </>
  );
}
