"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { MAX_EMERGENCY_CONTACTS } from "@/lib/account";
import type { ContactView } from "@/lib/services/contacts";
import { cn } from "@/lib/utils";

import {
  addContactAction,
  deleteAccountAction,
  removeContactAction,
  setHideLastNameAction,
} from "../actions";

const field =
  "h-12 w-full rounded-md border border-border bg-muted px-3 text-[15px] outline-none focus:border-primary focus:bg-card";

/**
 * Emergency contacts. Stored for the SOS screen's sake, but Comet never
 * calls or messages them — the screen says so, and nothing here dials.
 */
export function EmergencyContacts({ initial }: { initial: ContactView[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await addContactAction({ name, phone });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAdding(false);
      setName("");
      setPhone("");
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await removeContactAction({ contactId: id });
      if (!result.ok) setError(result.message);
      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-xl bg-card">
      <ul aria-label="Emergency contacts">
        {initial.map((c, i) => (
          <li
            key={c.id}
            className={cn("flex items-center gap-3 px-3.5 py-3", i > 0 && "border-t border-border")}
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-bold">
              {c.name[0]}
            </span>
            <span className="flex flex-1 flex-col">
              <span className="text-[15px] font-semibold">{c.name}</span>
              <span className="text-xs text-muted-foreground">{c.phone}</span>
            </span>
            <button
              type="button"
              onClick={() => remove(c.id)}
              disabled={pending}
              aria-label={`Remove ${c.name}`}
              className="flex size-10 items-center justify-center rounded-sm text-danger-text hover:bg-danger-soft"
            >
              <Trash2 className="size-[18px]" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <div
          className={cn(
            "flex flex-col gap-2.5 p-3.5",
            initial.length > 0 && "border-t border-border",
          )}
        >
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-muted-foreground">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              className={cn(field, "font-normal text-foreground")}
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-muted-foreground">
            Mobile number
            <input
              value={phone}
              inputMode="tel"
              autoComplete="off"
              placeholder="98765 43210"
              onChange={(e) => setPhone(e.target.value.slice(0, 20))}
              className={cn(field, "font-normal text-foreground")}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm font-semibold text-danger-text">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => setAdding(false)}
              className="h-11 flex-1 rounded-md"
            >
              Cancel
            </Button>
            <Button
              onClick={add}
              disabled={pending || !name.trim() || !phone.trim()}
              className="h-11 flex-1 rounded-md font-bold"
            >
              {pending ? "Saving…" : "Save contact"}
            </Button>
          </div>
        </div>
      ) : (
        initial.length < MAX_EMERGENCY_CONTACTS && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(
              "h-12 w-full text-sm font-bold text-info",
              initial.length > 0 && "border-t border-border",
            )}
          >
            + Add contact
          </button>
        )
      )}
      <p className="border-t border-border px-3.5 py-3 text-xs leading-normal text-muted-foreground">
        Comet is a portfolio project: it never calls or messages these contacts, even during an SOS.
        In a real emergency, call 112 from your phone.
      </p>
    </div>
  );
}

export function HideLastName({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-card p-4">
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold">Hide my last name</span>
        <span className="text-xs text-muted-foreground">
          Pilots see your first name and initial only
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          startTransition(async () => {
            const result = await setHideLastNameAction({ hide: next });
            if (!result.ok) setOn(!next);
          });
        }}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative h-8 w-[52px] shrink-0 rounded-full bg-border transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring after:absolute after:top-[3px] after:left-[3px] after:size-[26px] after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  );
}

/** "Delete my account": confirmed by typing DELETE (docs/UX_FLOWS.md Flow 11). */
export function DangerZone() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-12 rounded-md font-bold text-danger-text"
      >
        Delete my account
      </Button>
    );
  }
  return (
    <section
      aria-labelledby="delete-h"
      className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-card p-4"
    >
      <h2 id="delete-h" className="font-bold text-danger-text">
        Delete your account?
      </h2>
      <p className="text-sm leading-normal text-muted-foreground">
        Your name, email, saved places and emergency contacts are deleted and you&apos;re signed
        out. Past rides and payments stay on record as &quot;Deleted user&quot;. Your Comet ID is
        retired and never given to anyone else. This can&apos;t be undone.
      </p>
      <label className="flex flex-col gap-1 text-[13px] font-semibold text-muted-foreground">
        Type DELETE to confirm
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          className={cn(field, "font-normal text-foreground")}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger-text">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)} className="h-11 flex-1 rounded-md">
          Keep my account
        </Button>
        <Button
          variant="destructive"
          disabled={pending || confirm !== "DELETE"}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteAccountAction({ confirm });
              if (result && !result.ok) setError(result.message);
            })
          }
          className="h-11 flex-1 rounded-md bg-destructive font-bold text-white"
        >
          {pending ? "Deleting…" : "Delete account"}
        </Button>
      </div>
    </section>
  );
}
