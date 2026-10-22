"use client";

import { X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { pickupSlots } from "@/lib/scheduling";
import { cn } from "@/lib/utils";

const dayTop = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });
const dayDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", timeZone: "Asia/Kolkata" });
const slotLabel = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

/** "When?" for "13 · Schedule a ride": a day, then a quarter-hour slot. */
export function SchedulePicker({
  now,
  value,
  onPick,
  onClose,
}: {
  now: Date;
  value: Date | null;
  onPick: (at: Date | null) => void;
  onClose: () => void;
}) {
  const days = pickupSlots(now);
  const [dayIndex, setDayIndex] = useState(() => {
    const i = value
      ? days.findIndex((d) => d.slots.some((s) => s.getTime() === value.getTime()))
      : 0;
    return Math.max(0, i);
  });
  const [picked, setPicked] = useState<Date | null>(value);
  const day = days[dayIndex]!;

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-ink/40 md:items-center md:justify-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-title"
        className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[var(--radius-sheet)] bg-background md:max-w-[460px] md:rounded-3xl"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 id="schedule-title" className="font-heading text-[22px] font-bold tracking-tight">
            Schedule a ride
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-10 items-center justify-center rounded-full bg-card"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-4">
          <div className="flex flex-col gap-2">
            <span id="day-label" className="text-[13px] font-semibold text-muted-foreground">
              Day
            </span>
            <div role="radiogroup" aria-labelledby="day-label" className="grid grid-cols-4 gap-2">
              {days.map((d, i) => (
                <button
                  key={d.day.toISOString()}
                  type="button"
                  role="radio"
                  aria-checked={i === dayIndex}
                  onClick={() => setDayIndex(i)}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-0.5 rounded-md border-2 bg-card",
                    i === dayIndex ? "border-primary bg-brand-soft" : "border-transparent",
                  )}
                >
                  <span className="text-xs font-semibold text-muted-foreground">
                    {i === 0 && d.day.getTime() <= now.getTime() ? "Today" : dayTop.format(d.day)}
                  </span>
                  <span className="font-heading text-[17px] font-bold">
                    {dayDate.format(d.day)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span id="time-label" className="text-[13px] font-semibold text-muted-foreground">
              Pickup time
            </span>
            <div
              role="radiogroup"
              aria-labelledby="time-label"
              className="grid max-h-[260px] grid-cols-3 gap-2 overflow-y-auto pr-1"
            >
              {day.slots.map((slot) => {
                const on = picked?.getTime() === slot.getTime();
                return (
                  <button
                    key={slot.toISOString()}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPicked(slot)}
                    className={cn(
                      "h-11 rounded-sm border-2 bg-card text-[15px] font-bold",
                      on ? "border-primary bg-brand-soft" : "border-transparent",
                    )}
                  >
                    {slotLabel.format(slot)}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-xs leading-normal text-muted-foreground">
            We assign your Pilot 15 minutes before pickup. The fare you see now is locked in, and
            cancelling is free until a Pilot is assigned.
          </p>
        </div>
        <div className="flex gap-2 bg-card px-5 pt-3.5 pb-6">
          {value && (
            <Button
              variant="outline"
              onClick={() => {
                onPick(null);
                onClose();
              }}
              className="h-14 flex-1 rounded-lg font-bold"
            >
              Ride now instead
            </Button>
          )}
          <Button
            onClick={() => {
              onPick(picked);
              onClose();
            }}
            disabled={!picked}
            className="h-14 flex-1 rounded-lg text-[17px] font-bold"
          >
            Set pickup time
          </Button>
        </div>
      </section>
    </div>
  );
}
